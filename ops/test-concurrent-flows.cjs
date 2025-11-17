#!/usr/bin/env node
/**
 * Load Test: Concurrent Flow Execution
 * 
 * Tests the concurrent job dispatcher by creating and executing multiple flows
 * with varying loads to determine optimal MAX_CONCURRENT_JOBS setting.
 * 
 * Usage:
 *   node ops/test-concurrent-flows.js [numFlows] [complexity]
 * 
 * Examples:
 *   node ops/test-concurrent-flows.js 20 light    # 20 flows, light load (50ms each)
 *   node ops/test-concurrent-flows.js 30 medium   # 30 flows, medium load (200ms each)
 *   node ops/test-concurrent-flows.js 50 heavy    # 50 flows, heavy load (500ms each)
 */

const http = require('http');

// Configuration
const NUM_FLOWS = parseInt(process.argv[2]) || 20;
const COMPLEXITY = process.argv[3] || 'medium';

const COMPLEXITIES = {
  light: { delay: 50, steps: 5, description: 'Light (5 steps x 50ms = 250ms)' },
  medium: { delay: 200, steps: 5, description: 'Medium (5 steps x 200ms = 1s)' },
  heavy: { delay: 500, steps: 5, description: 'Heavy (5 steps x 500ms = 2.5s)' }
};

const config = COMPLEXITIES[COMPLEXITY] || COMPLEXITIES.medium;

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyODlkNjEzNS01NzdiLTQ0YmEtYTQ3NC0wMGI4MWJjZGNmYmIiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjMzMjQwNDgsImV4cCI6MTc2MzQxMDQ0OH0.leP6sbhghVLOn3-XljFM8GMkvBb2hwlTDeY0PAAETL0';

// Helper: Make HTTP request
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN && { 'Authorization': `Bearer ${AUTH_TOKEN}` })
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Create a test flow with demo_sleep job
async function createTestFlow(index) {
  const flowName = `Load Test Flow ${index}`;
  const flowDefinition = {
    nodes: [
      {
        id: `trigger-${index}`,
        type: 'trigger-manual',
        position: { x: 100, y: 100 },
        data: {}
      },
      {
        id: `script-${index}`,
        type: 'script-js',
        position: { x: 300, y: 100 },
        data: {
          code: `// Simulated ${COMPLEXITY} computation
const start = Date.now();
let result = 0;
for (let i = 0; i < ${config.delay * 1000}; i++) {
  result += Math.sqrt(i);
}
console.log('Computation took', Date.now() - start, 'ms');
return { index: ${index}, result: result % 1000 };`
        }
      }
    ],
    edges: [
      {
        id: `e-${index}`,
        source: `trigger-${index}`,
        target: `script-${index}`
      }
    ]
  };

  const response = await makeRequest('POST', '/api/flows', {
    name: flowName,
    description: `Load test flow ${index} - ${config.description}`,
    definition: flowDefinition
  });

  if (response.status !== 200) {
    throw new Error(`Failed to create flow ${index}: ${JSON.stringify(response.data)}`);
  }

  return response.data.flow;
}

// Deploy a flow
async function deployFlow(flowId) {
  const response = await makeRequest('PUT', `/api/flows/${flowId}`, {
    deployed: true
  });

  if (response.status !== 200) {
    throw new Error(`Failed to deploy flow ${flowId}`);
  }
}

// Execute a flow
async function executeFlow(flowId) {
  const startTime = Date.now();
  const response = await makeRequest('POST', `/api/flows/${flowId}/execute`, {});

  if (response.status !== 200) {
    throw new Error(`Failed to execute flow ${flowId}: ${JSON.stringify(response.data)}`);
  }

  return {
    jobId: response.data.jobId,
    flowId,
    queuedAt: startTime
  };
}

// Get job status
async function getJobStatus(jobId) {
  const response = await makeRequest('GET', `/api/jobs/${jobId}`);
  if (response.status === 200) {
    return response.data; // API returns job directly, not wrapped
  }
  return null;
}

// Wait for all jobs to complete
async function waitForJobs(executions, maxWaitMs = 60000) {
  const startWait = Date.now();
  const completedJobs = new Map();
  const results = {
    total: executions.length,
    completed: 0,
    failed: 0,
    timeout: 0,
    durations: [],
    queueTimes: []
  };

  console.log(`\nWaiting for ${executions.length} jobs to complete (max ${maxWaitMs / 1000}s)...`);

  while (completedJobs.size < executions.length && Date.now() - startWait < maxWaitMs) {
    for (const exec of executions) {
      if (completedJobs.has(exec.jobId)) continue;

      const job = await getJobStatus(exec.jobId);
      if (!job) continue;

      if (job.status === 'completed' || job.status === 'failed') {
        completedJobs.set(exec.jobId, job);
        
        const queueTime = job.started_at 
          ? new Date(job.started_at) - exec.queuedAt
          : 0;
        
        const duration = job.finished_at && job.started_at
          ? new Date(job.finished_at) - new Date(job.started_at)
          : 0;

        results.queueTimes.push(queueTime);
        results.durations.push(duration);

        if (job.status === 'completed') {
          results.completed++;
          process.stdout.write('✓');
        } else {
          results.failed++;
          process.stdout.write('✗');
        }
      }
    }

    if (completedJobs.size % 10 === 0 && completedJobs.size > 0) {
      console.log(` ${completedJobs.size}/${executions.length}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  results.timeout = executions.length - completedJobs.size;
  console.log(`\n`);

  return results;
}

// Cleanup: Delete test flows
async function cleanup(flowIds) {
  console.log(`\nCleaning up ${flowIds.length} test flows...`);
  for (const flowId of flowIds) {
    try {
      await makeRequest('DELETE', `/api/flows/${flowId}`);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

// Main test execution
async function runLoadTest() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  DataForeman Flow Concurrency Load Test                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Configuration:`);
  console.log(`  • Number of flows: ${NUM_FLOWS}`);
  console.log(`  • Complexity: ${COMPLEXITY} ${config.description}`);
  console.log(`  • API endpoint: ${API_BASE}`);
  console.log(`  • Auth: ${AUTH_TOKEN ? 'Enabled' : 'Disabled (development mode)'}\n`);

  const flowIds = [];

  try {
    // Phase 1: Create flows
    console.log(`Phase 1: Creating ${NUM_FLOWS} test flows...`);
    for (let i = 1; i <= NUM_FLOWS; i++) {
      const flow = await createTestFlow(i);
      flowIds.push(flow.id);
      process.stdout.write('.');
      if (i % 10 === 0) console.log(` ${i}/${NUM_FLOWS}`);
    }
    console.log(` ${NUM_FLOWS}/${NUM_FLOWS} ✓\n`);

    // Phase 2: Deploy flows
    console.log(`Phase 2: Deploying ${NUM_FLOWS} flows...`);
    for (let i = 0; i < flowIds.length; i++) {
      await deployFlow(flowIds[i]);
      process.stdout.write('.');
      if ((i + 1) % 10 === 0) console.log(` ${i + 1}/${NUM_FLOWS}`);
    }
    console.log(` ${NUM_FLOWS}/${NUM_FLOWS} ✓\n`);

    // Phase 3: Execute all flows rapidly
    console.log(`Phase 3: Executing ${NUM_FLOWS} flows simultaneously...`);
    const execStartTime = Date.now();
    const executions = await Promise.all(
      flowIds.map(flowId => executeFlow(flowId))
    );
    const execQueueTime = Date.now() - execStartTime;
    console.log(`All ${NUM_FLOWS} flows queued in ${execQueueTime}ms ✓\n`);

    // Phase 4: Wait for completion
    console.log(`Phase 4: Monitoring execution...`);
    const results = await waitForJobs(executions);

    // Phase 5: Calculate statistics
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Test Results                                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Execution Summary:`);
    console.log(`  • Total jobs: ${results.total}`);
    console.log(`  • Completed: ${results.completed} (${(results.completed / results.total * 100).toFixed(1)}%)`);
    console.log(`  • Failed: ${results.failed}`);
    console.log(`  • Timeout: ${results.timeout}\n`);

    if (results.durations.length > 0) {
      const avgDuration = results.durations.reduce((a, b) => a + b, 0) / results.durations.length;
      const minDuration = Math.min(...results.durations);
      const maxDuration = Math.max(...results.durations);
      
      const avgQueueTime = results.queueTimes.reduce((a, b) => a + b, 0) / results.queueTimes.length;
      const minQueueTime = Math.min(...results.queueTimes);
      const maxQueueTime = Math.max(...results.queueTimes);

      console.log(`Queue Time (time from submit to start):`);
      console.log(`  • Average: ${avgQueueTime.toFixed(0)}ms`);
      console.log(`  • Min: ${minQueueTime}ms`);
      console.log(`  • Max: ${maxQueueTime}ms\n`);

      console.log(`Execution Duration (time from start to finish):`);
      console.log(`  • Average: ${avgDuration.toFixed(0)}ms`);
      console.log(`  • Min: ${minDuration}ms`);
      console.log(`  • Max: ${maxDuration}ms\n`);

      // Calculate throughput
      const totalWallTime = maxDuration + maxQueueTime;
      const throughput = (results.completed / totalWallTime * 1000).toFixed(2);
      console.log(`Performance:`);
      console.log(`  • Total wall time: ${totalWallTime}ms`);
      console.log(`  • Throughput: ${throughput} flows/second\n`);

      // Recommendations
      console.log(`Recommendations:`);
      const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_JOBS) || 20;
      if (avgQueueTime < 100) {
        console.log(`  ✓ System handled ${NUM_FLOWS} concurrent flows well (avg queue: ${avgQueueTime.toFixed(0)}ms)`);
        console.log(`  ✓ Current MAX_CONCURRENT_JOBS=${maxConcurrent} is sufficient`);
        if (NUM_FLOWS < 50) {
          console.log(`  → Try testing with more flows (50+) to find limit`);
        }
      } else if (avgQueueTime < 1000) {
        console.log(`  ⚠ Moderate queue times (avg: ${avgQueueTime.toFixed(0)}ms)`);
        console.log(`  → Consider increasing MAX_CONCURRENT_JOBS to ${maxConcurrent + 10}`);
      } else {
        console.log(`  ✗ High queue times (avg: ${avgQueueTime.toFixed(0)}ms)`);
        console.log(`  → Increase MAX_CONCURRENT_JOBS significantly (try ${maxConcurrent + 20})`);
        console.log(`  → Or reduce flow complexity`);
      }
    }

  } finally {
    // Cleanup
    await cleanup(flowIds);
    console.log('✓ Cleanup complete\n');
  }
}

// Run the test
runLoadTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
