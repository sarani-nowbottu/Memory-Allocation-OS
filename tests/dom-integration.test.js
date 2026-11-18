import test from "node:test";
import assert from "node:assert/strict";
import { renderOverviewPage } from "../src/pages/overview.js";
import { renderSimulatorPage } from "../src/pages/simulator.js";
import { renderProcessQueuePage } from "../src/pages/process-queue.js";
import { renderComparisonPage } from "../src/pages/comparison.js";
import { renderActivityLogPage } from "../src/pages/activity-log.js";
import { ProcessManager } from "../src/process-manager.js";

test("DOM template generation contains all necessary elements and IDs", () => {
  const pages = {
    overview: renderOverviewPage(),
    simulator: renderSimulatorPage(),
    queue: renderProcessQueuePage(),
    comparison: renderComparisonPage(),
    activity: renderActivityLogPage()
  };

  // Verify Overview contains live state and reset controls
  assert.ok(pages.overview.includes('id="overview-active-policy"'));
  assert.ok(pages.overview.includes('id="overview-allocated-mem"'));
  assert.ok(pages.overview.includes('id="overview-free-mem"'));
  assert.ok(pages.overview.includes('id="overview-queue-count"'));
  assert.ok(pages.overview.includes('id="overview-reset-clean-btn"'));

  // Verify Simulator contains clean reset button and memory elements
  assert.ok(pages.simulator.includes('id="reset-clean-button"'));
  assert.ok(pages.simulator.includes('id="reset-button"'));
  assert.ok(pages.simulator.includes('id="policy-select"'));
  assert.ok(pages.simulator.includes('id="allocated-value"'));
  assert.ok(pages.simulator.includes('id="free-value"'));
  assert.ok(pages.simulator.includes('id="memory-arena"'));
  assert.ok(pages.simulator.includes('id="block-table-body"'));
  assert.ok(pages.simulator.includes('id="compact-button"'));

  // Verify Process Queue contains clean reset and management elements
  assert.ok(pages.queue.includes('id="queue-reset-clean-button"'));
  assert.ok(pages.queue.includes('id="queue-policy-select"'));
  assert.ok(pages.queue.includes('id="queue-list"'));
  assert.ok(pages.queue.includes('id="add-process-button"'));
  assert.ok(pages.queue.includes('id="add-process-form"'));
  assert.ok(pages.queue.includes('id="queue-empty"'));

  // Verify Comparison contains clean preset, control actions, and live synchronization buttons
  assert.ok(pages.comparison.includes('comp-page-heading'));
  assert.ok(pages.comparison.includes('comp-preset-strip'));
  assert.ok(pages.comparison.includes('id="comp-preset-demo-btn"'));
  assert.ok(pages.comparison.includes('id="comp-preset-live-btn"'));
  assert.ok(pages.comparison.includes('id="comp-preset-clean-btn"'));
  assert.ok(pages.comparison.includes('id="comp-preset-test-btn"'));
  assert.ok(pages.comparison.includes('id="comp-add-proc-btn"'));
  assert.ok(pages.comparison.includes('id="comp-step-btn"'));
  assert.ok(pages.comparison.includes('id="comp-run-btn"'));
  assert.ok(pages.comparison.includes('id="simulators-grid"'));
  assert.ok(pages.comparison.includes('id="comparison-matrix-body"'));
});

test("Top navigation shell includes theme toggle button across all pages", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="theme-toggle"'));
  assert.ok(html.includes('id="theme-label"'));
  assert.ok(html.includes('src/styles/theme.css'));
});

test("ProcessManager state and statistics transition accurately through full lifecycle", () => {
  const manager = new ProcessManager();

  // Initial state has example blocks
  assert.equal(manager.blocks.length, 7);
  assert.equal(manager.queue.length, 3);

  // 1. Reset memory to 1024 MB
  manager.resetTo1024();
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].offset, 0);
  assert.equal(manager.blocks[0].size, 1024);
  assert.equal(manager.blocks[0].pid, null);
  assert.equal(manager.queue.length, 0);

  let stats = manager.getStats();
  assert.equal(stats.allocatedMemory, 0);
  assert.equal(stats.freeMemory, 1024);
  assert.equal(stats.allocatedCount, 0);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 1024);
  assert.equal(stats.externalFragmentation, 0);

  // 2. Add P1 requesting 200 MB
  const p1 = manager.enqueueProcess(200, 1, 2);
  assert.notEqual(p1, null);
  assert.equal(p1.pid, 1);
  assert.equal(p1.size, 200);

  stats = manager.getStats();
  assert.equal(stats.queueCount, 1);
  assert.equal(stats.queueDemand, 200);
  assert.equal(stats.headProcess.pid, 1);

  // 3. Allocate P1 using First Fit
  const res = manager.allocateNext("first");
  assert.equal(res.success, true);
  assert.equal(res.offset, 0);
  assert.equal(res.process.pid, 1);
  assert.equal(res.process.size, 200);

  // Queue must be empty now
  assert.equal(manager.queue.length, 0);

  // Memory Simulator blocks verification
  assert.equal(manager.blocks.length, 2);
  assert.deepEqual(manager.blocks[0], { offset: 0, size: 200, pid: 1 });
  assert.deepEqual(manager.blocks[1], { offset: 200, size: 824, pid: null });

  stats = manager.getStats();
  assert.equal(stats.allocatedMemory, 200);
  assert.equal(stats.freeMemory, 824);
  assert.equal(stats.allocatedCount, 1);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 824);
  assert.equal(stats.externalFragmentation, 0);

  // 4. Release P1
  const rel = manager.release(1);
  assert.equal(rel, true);

  // Free blocks coalesced into one 1024 MB block
  assert.equal(manager.blocks.length, 1);
  assert.deepEqual(manager.blocks[0], { offset: 0, size: 1024, pid: null });

  stats = manager.getStats();
  assert.equal(stats.allocatedMemory, 0);
  assert.equal(stats.freeMemory, 1024);
  assert.equal(stats.allocatedCount, 0);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 1024);
  assert.equal(stats.externalFragmentation, 0);
});

test("All frontend modules and controllers parse and import cleanly without syntax errors", async () => {
  const modules = [
    "../src/algorithms/memory-allocation.js",
    "../src/utils/feedback.js",
    "../src/process-manager.js",
    "../src/pages/overview.js",
    "../src/pages/simulator.js",
    "../src/pages/process-queue.js",
    "../src/pages/comparison.js",
    "../src/pages/activity-log.js",
    "../src/overview.js",
    "../src/simulator.js",
    "../src/process-queue.js",
    "../src/comparison.js",
    "../src/activity-log.js",
    "../src/navigation.js",
    "../src/theme.js"
  ];

  for (const mod of modules) {
    const imported = await import(mod);
    assert.ok(imported, `${mod} must export valid module members`);
  }
});
