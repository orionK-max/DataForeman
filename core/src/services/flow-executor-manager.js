// Flow Executor Manager
//
// Spawns and supervises the dedicated flow-execution child process (core/src/executor/index.js),
// isolating continuous-mode flow scans (ScanExecutor's setInterval loop) from core's own
// HTTP-serving event loop. See temp/mqtt-broker-flapping-fixes-plan.md item #5.
//
// This replaces core constructing FlowSession/ScanExecutor in-process for continuous flows.
// The manager tracks which flows are *supposed* to be running so it can restart them on the
// executor child crashing/restarting, and mirrors the child's outputs/metrics sync back into
// core's own RuntimeStateStore + an in-memory metrics cache (used by flow-resources.js).

import fp from 'fastify-plugin';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { SUBJECT_OUTPUTS, SUBJECT_TRIGGER } from '../executor/subjects.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXECUTOR_ENTRYPOINT = resolve(__dirname, '../executor/index.js');

export const flowExecutorManagerPlugin = fp(async (app) => {
  const log = app.log.child({ mod: 'flow_executor_manager' });

  let child = null;
  let ready = false;
  const desiredFlows = new Map(); // flowId -> flow definition, "what should be running"
  const pendingStarts = new Map(); // flowId -> { resolve, reject }
  const pendingStops = new Map();  // flowId -> { resolve, reject }
  const latestMetrics = new Map(); // flowId -> metrics snapshot from last sync message
  let restartAttempts = 0;
  let shuttingDown = false;

  function spawnChild() {
    log.info('Spawning flow executor process');
    child = fork(EXECUTOR_ENTRYPOINT, [], {
      env: process.env,
      silent: false,
    });
    ready = false;

    child.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.evt === 'ready') {
        ready = true;
        restartAttempts = 0;
        // Re-assert desired state after a (re)start, e.g. following a crash-restart.
        for (const flow of desiredFlows.values()) {
          child.send({ cmd: 'start', flow });
        }
      } else if (msg.evt === 'started') {
        pendingStarts.get(msg.flowId)?.resolve(msg);
        pendingStarts.delete(msg.flowId);
      } else if (msg.evt === 'stopped') {
        pendingStops.get(msg.flowId)?.resolve(msg);
        pendingStops.delete(msg.flowId);
      } else if (msg.evt === 'error') {
        log.error({ flowId: msg.flowId, error: msg.error }, 'Flow executor reported error');
        pendingStarts.get(msg.flowId)?.reject(new Error(msg.error));
        pendingStarts.delete(msg.flowId);
      }
    });

    child.on('exit', (code, signal) => {
      ready = false;
      if (shuttingDown) return;
      log.warn({ code, signal, restartAttempts }, 'Flow executor process exited unexpectedly - restarting');
      restartAttempts += 1;
      const delayMs = Math.min(30_000, 2000 * restartAttempts);
      setTimeout(spawnChild, delayMs);
    });

    child.on('error', (err) => {
      log.error({ err }, 'Flow executor process error');
    });
  }

  function waitForReady(timeoutMs = 10_000) {
    if (ready) return Promise.resolve();
    return new Promise((resolvePromise, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (ready) { clearInterval(iv); resolvePromise(); }
        else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('flow executor not ready (timeout)')); }
      }, 100);
    });
  }

  async function startFlow(flow) {
    desiredFlows.set(flow.id, flow);
    await waitForReady();
    return new Promise((resolvePromise, reject) => {
      pendingStarts.set(flow.id, { resolve: resolvePromise, reject });
      child.send({ cmd: 'start', flow });
      // Safety timeout so a lost IPC message can't hang the caller forever.
      setTimeout(() => {
        if (pendingStarts.has(flow.id)) {
          pendingStarts.delete(flow.id);
          resolvePromise({ evt: 'started', flowId: flow.id, timedOut: true });
        }
      }, 10_000);
    });
  }

  async function stopFlow(flowId) {
    desiredFlows.delete(flowId);
    latestMetrics.delete(flowId);
    if (!ready || !child) return; // nothing running to stop
    return new Promise((resolvePromise) => {
      pendingStops.set(flowId, { resolve: resolvePromise });
      child.send({ cmd: 'stop', flowId });
      setTimeout(() => {
        if (pendingStops.has(flowId)) {
          pendingStops.delete(flowId);
          resolvePromise({ evt: 'stopped', flowId, timedOut: true });
        }
      }, 10_000);
    });
  }

  function getMetrics(flowId) {
    return latestMetrics.get(flowId) || null;
  }

  function isRunning(flowId) {
    return desiredFlows.has(flowId);
  }

  // executor -> core sync: node outputs (Flow Editor live view) + resource metrics (Resource Monitor).
  app.addHook('onReady', async () => {
    if (app.nats?.healthy?.()) {
      app.nats.subscribe(SUBJECT_OUTPUTS, (msg) => {
        try {
          const obj = typeof msg === 'object' && msg?.flow_id ? msg : JSON.parse(Buffer.from(msg.data || msg).toString('utf8'));
          if (!obj?.flow_id) return;
          if (obj.outputs && typeof obj.outputs === 'object') {
            app.runtimeState.initFlow(obj.flow_id);
            for (const [nodeId, output] of Object.entries(obj.outputs)) {
              app.runtimeState.setNodeOutput(obj.flow_id, nodeId, output);
            }
          }
          if (obj.metrics) latestMetrics.set(obj.flow_id, obj.metrics);
        } catch (err) {
          log.warn({ err }, 'Failed to process flow executor outputs sync message');
        }
      });
    }
    spawnChild();
  });

  app.addHook('onClose', async () => {
    shuttingDown = true;
    if (child) {
      try { child.send({ cmd: 'shutdown' }); } catch {}
      await new Promise((r) => setTimeout(r, 500));
      try { child.kill(); } catch {}
    }
  });

  app.decorate('flowExecutorManager', {
    startFlow,
    stopFlow,
    getMetrics,
    isRunning,
    // For manual-trigger routes: publish to the executor over NATS instead of only setting
    // core's own local RuntimeStateStore (see plan item #5, question 1b).
    publishTrigger(flowId, nodeId, value) {
      if (!app.nats?.healthy?.()) return;
      try {
        app.nats.publish(SUBJECT_TRIGGER, { schema: SUBJECT_TRIGGER, ts: new Date().toISOString(), flow_id: flowId, node_id: nodeId, value });
      } catch (err) {
        log.warn({ err, flowId, nodeId }, 'Failed to publish trigger to flow executor');
      }
    },
  });
});

export default flowExecutorManagerPlugin;
