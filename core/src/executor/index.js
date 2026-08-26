// Flow executor process
//
// Runs continuous-mode flows (ScanExecutor/FlowSession) in a dedicated OS process, isolated from
// core's HTTP-serving event loop. See temp/mqtt-broker-flapping-fixes-plan.md item #5.
//
// This process is spawned by core via child_process.fork() (see ../services/flow-executor-manager.js).
// It reuses core's existing Fastify-plugin services (db/tsdb/nats) headlessly - no HTTP server, no
// routes, never calls .listen(). ScanExecutor/FlowSession run completely unmodified; the only change
// is *where* their setInterval loop lives.
//
// IPC protocol (parent <-> child, plain JSON messages via process.send/process.on('message')):
//   parent -> child: { cmd: 'start', flow }               start a continuous flow's ScanExecutor
//   parent -> child: { cmd: 'stop', flowId }               stop a running flow
//   parent -> child: { cmd: 'update-settings', flowId, settings }  apply settings to a running flow in place (no restart)
//   parent -> child: { cmd: 'shutdown' }                   stop everything and exit
//   child  -> parent: { evt: 'started', flowId, sessionId }
//   child  -> parent: { evt: 'stopped', flowId }
//   child  -> parent: { evt: 'error', flowId, error }
//   child  -> parent: { evt: 'ready' }                     sent once bootstrap completes

import Fastify from 'fastify';
import pino from 'pino';
import { dbPlugin } from '../services/db.js';
import { tsdbPlugin } from '../services/tsdb.js';
import { natsPlugin } from '../services/nats.js';
import { RuntimeStateStore } from '../services/runtime-state-store.js';
import { registerAllNodes } from '../nodes/index.js';
import { FlowSession } from '../services/flow-session.js';
import { ScanExecutor } from '../services/flow-executor.js';
import { SUBJECT_OUTPUTS, SUBJECT_TRIGGER } from './subjects.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function main() {
  const app = Fastify({ logger });
  await app.register(dbPlugin);
  try {
    await app.register(tsdbPlugin); // tsdb may be optional in some environments
  } catch (err) {
    app.log.warn({ err }, 'tsdb plugin unavailable in executor process, falling back to db');
  }
  await app.register(natsPlugin);

  const runtimeState = new RuntimeStateStore();
  app.decorate('runtimeState', runtimeState);

  registerAllNodes();

  /** @type {Map<string, FlowSession>} */
  const sessions = new Map();

  // Per-flow snapshot of last-published outputs, so we only publish over NATS when something
  // actually changed (flows can tick every 1s - don't flood NATS with identical snapshots).
  const lastPublished = new Map(); // flowId -> JSON string of last published outputs

  function publishOutputsIfChanged(flowId) {
    if (!app.nats?.healthy?.()) return;
    const flowState = runtimeState.flows.get(flowId);
    if (!flowState) return;
    const outputs = Object.fromEntries(flowState.outputs);
    const session = sessions.get(flowId);
    const metrics = session?.scanExecutor?.getMetrics?.() || null;
    const serialized = JSON.stringify(outputs);
    if (lastPublished.get(flowId) === serialized) return; // no change since last publish
    lastPublished.set(flowId, serialized);
    try {
      // Bundles both node outputs (for the Flow Editor live view / RuntimeStateStore) and resource
      // metrics (for the Resource Monitor route, flow-resources.js) in one message - both come from
      // the same onMetricsUpdate hook, no need for two separate sync channels.
      app.nats.publish(SUBJECT_OUTPUTS, { schema: SUBJECT_OUTPUTS, ts: new Date().toISOString(), flow_id: flowId, outputs, metrics });
    } catch (err) {
      app.log.warn({ err, flowId }, 'Failed to publish flow outputs to NATS');
    }
  }

  // core -> executor: manual trigger flags fired from the Flow Editor UI's trigger button.
  if (app.nats?.healthy?.()) {
    app.nats.subscribe(SUBJECT_TRIGGER, (msg) => {
      try {
        const obj = typeof msg === 'object' && msg?.flow_id ? msg : JSON.parse(Buffer.from(msg.data || msg).toString('utf8'));
        if (!obj?.flow_id || !obj?.node_id) return;
        runtimeState.setTriggerFlag(obj.flow_id, obj.node_id, !!obj.value);
      } catch (err) {
        app.log.warn({ err }, 'Failed to process trigger sync message');
      }
    });
  }

  async function startFlow(flow) {
    if (sessions.has(flow.id)) {
      app.log.warn({ flowId: flow.id }, 'Flow already running in executor, ignoring duplicate start');
      return;
    }
    runtimeState.initFlow(flow.id);
    const executionContext = { app, flow, execution: null, params: {}, logBuffer: null, runtimeState };
    const session = new FlowSession(flow, executionContext, ScanExecutor);

    // Chain metrics callback: keep existing resource-metrics writing (unchanged), and additionally
    // publish outputs to NATS after each scan cycle so core's RuntimeStateStore stays in sync.
    sessions.set(flow.id, session);
    try {
      await session.start();
      const scanExecutor = session.scanExecutor;
      const priorCallback = scanExecutor.onMetricsUpdate;
      scanExecutor.onMetricsUpdate = async (metrics) => {
        if (priorCallback) await priorCallback(metrics).catch(() => {});
        publishOutputsIfChanged(flow.id);
      };
      // session.start() already ran (and metrics-published) the first scan cycle before we could
      // chain the callback above - publish once now so the first tick's outputs aren't missed.
      publishOutputsIfChanged(flow.id);
      process.send?.({ evt: 'started', flowId: flow.id, sessionId: session.sessionId });
    } catch (err) {
      sessions.delete(flow.id);
      app.log.error({ err, flowId: flow.id }, 'Failed to start flow in executor');
      process.send?.({ evt: 'error', flowId: flow.id, error: err.message });
    }
  }

  async function stopFlow(flowId) {
    const session = sessions.get(flowId);
    if (!session) return;
    try {
      await session.stop();
    } catch (err) {
      app.log.error({ err, flowId }, 'Error stopping flow in executor');
    } finally {
      sessions.delete(flowId);
      lastPublished.delete(flowId);
      runtimeState.clearFlow(flowId);
      process.send?.({ evt: 'stopped', flowId });
    }
  }

  async function shutdown() {
    app.log.info({ count: sessions.size }, 'Executor shutting down - stopping all flows');
    await Promise.all(Array.from(sessions.keys()).map((flowId) => stopFlow(flowId)));
    await app.close().catch(() => {});
    process.exit(0);
  }

  process.on('message', async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    try {
      if (msg.cmd === 'start' && msg.flow) await startFlow(msg.flow);
      else if (msg.cmd === 'stop' && msg.flowId) await stopFlow(msg.flowId);
      else if (msg.cmd === 'update-settings' && msg.flowId) {
        const session = sessions.get(msg.flowId);
        await session?.updateSettings(msg.settings);
      }
      else if (msg.cmd === 'shutdown') await shutdown();
    } catch (err) {
      app.log.error({ err, msg }, 'Executor failed to handle IPC message');
    }
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  process.send?.({ evt: 'ready' });
  app.log.info('Flow executor process ready');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Flow executor process failed to start', err);
  process.exit(1);
});
