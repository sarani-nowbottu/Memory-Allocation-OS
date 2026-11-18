import test from "node:test";
import assert from "node:assert/strict";
import { findAllocation, placeAllocation, mergeFreeBlocks, calculateFragmentation, TOTAL_MEMORY } from "../src/algorithms/memory-allocation.js";
import { ProcessManager } from "../src/process-manager.js";

test("Requirement 9: Never mark process as failed if contiguous free block exists (50 MB into 310 MB block)", () => {
  const policies = ["first", "best", "worst", "next"];
  // Set up scenario where memory has an occupied prefix and a contiguous 310 MB free block
  const blocks = [
    { offset: 0, size: 50, pid: 1 },
    { offset: 50, size: 100, pid: 2 },
    { offset: 150, size: 160, pid: 3 },
    { offset: 310, size: 404, pid: 4 },
    { offset: 714, size: 310, pid: null } // 310 MB contiguous free block
  ];

  // Test across all 4 policies and various pointer positions
  for (const policy of policies) {
    for (const pointer of [0, 100, 310, 500, 714, 800, 1000, 1024, undefined, null]) {
      const placement = findAllocation(blocks, 50, policy, pointer);
      assert.notEqual(
        placement,
        null,
        `${policy} with pointer ${pointer} must successfully find placement in 310 MB block`
      );
      assert.ok(
        placement.offset >= 714 && placement.offset + 50 <= 1024,
        `${policy} placed at offset ${placement.offset}, which fits inside [714, 1024]`
      );
    }
  }
});

test("Requirement 1 & 6: Truly independent memory states and dynamic process allocation", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Initially 0 MB allocated, 1,024 MB free on all 4 algorithms
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks.length, 1);
    assert.equal(sim.blocks[0].size, TOTAL_MEMORY);
    assert.equal(sim.blocks[0].pid, null);
    assert.equal(sim.successfulCount, 0);
    assert.equal(sim.failedCount, 0);
  }

  // Enqueue processes via shared engine
  manager.enqueueProcess(100, 1);
  manager.enqueueProcess(200, 2);
  manager.enqueueProcess(150, 3);

  // Allocate all three
  while (manager.queue.length > 0) {
    const res = manager.stepSharedAllocation();
    assert.equal(res.success, true);
  }

  // All 4 have 450 MB allocated, 574 MB free
  for (const sim of manager.comparisonSimulators) {
    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, 574);
    assert.equal(sim.successfulCount, 3);
    assert.equal(sim.failedCount, 0);
  }

  // Release P2 (200 MB @ offset 100)
  manager.release(2);

  // Free holes in all 4 algorithms: 200 MB @ 100, and 574 MB @ 450
  for (const sim of manager.comparisonSimulators) {
    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.freeBlockCount, 2);
    assert.equal(frag.totalFree, 774);
    assert.equal(frag.largestFree, 574);
    assert.equal(frag.externalFragmentation, 200);
  }

  // Now allocate P4 (180 MB)
  manager.enqueueProcess(180, 4);
  manager.stepSharedAllocation();

  // Verification of algorithm independence and distinct placement rules:
  // First Fit: scans from 0, picks 200 MB hole @ 100 MB
  const ff = manager.comparisonSimulators.find(s => s.id === "first");
  assert.equal(ff.lastAction.offset, 100);

  // Best Fit: compares 200 MB hole (leftover 20) vs 574 MB hole (leftover 394), picks closest @ 100 MB
  const bf = manager.comparisonSimulators.find(s => s.id === "best");
  assert.equal(bf.lastAction.offset, 100);

  // Worst Fit: picks largest hole @ 450 MB (leftover 394 MB)
  const wf = manager.comparisonSimulators.find(s => s.id === "worst");
  assert.equal(wf.lastAction.offset, 450);

  // Next Fit: continues from pointer (450 MB), picks hole @ 450 MB
  const nf = manager.comparisonSimulators.find(s => s.id === "next");
  assert.equal(nf.lastAction.offset, 450);

  // Verify memory block layouts are distinct between First Fit and Worst Fit
  const ffAllocated = ff.blocks.filter(b => b.pid !== null).map(b => ({ pid: b.pid, offset: b.offset }));
  const wfAllocated = wf.blocks.filter(b => b.pid !== null).map(b => ({ pid: b.pid, offset: b.offset }));
  assert.notDeepEqual(ffAllocated, wfAllocated, "First Fit and Worst Fit must have distinct memory layouts");
});

test("Requirement 10 & 11: Real-time matrix updates and reset persistence", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Verify clean state
  for (const sim of manager.comparisonSimulators) {
    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, TOTAL_MEMORY);
    assert.equal(frag.largestFree, TOTAL_MEMORY);
    assert.equal(frag.externalFragmentation, 0);
    assert.equal(sim.successfulCount, 0);
    assert.equal(sim.failedCount, 0);
  }

  // Enqueue and allocate
  manager.enqueueProcess(80, 10);
  manager.stepSharedAllocation();

  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.successfulCount, 1);
    assert.notEqual(sim.lastAction, null);
    assert.equal(sim.lastAction.success, true);
    assert.equal(sim.lastAction.pid, 10);
    assert.equal(sim.lastAction.size, 80);
  }

  // Reset simulator
  manager.resetTo1024();

  // Verify everything is cleared
  assert.equal(manager.queue.length, 0);
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].size, TOTAL_MEMORY);
  assert.equal(manager.blocks[0].pid, null);

  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks.length, 1);
    assert.equal(sim.blocks[0].size, TOTAL_MEMORY);
    assert.equal(sim.blocks[0].pid, null);
    assert.equal(sim.pointer, 0);
    assert.equal(sim.successfulCount, 0);
    assert.equal(sim.failedCount, 0);
    assert.equal(sim.lastAction, null);
  }
});

test("Section 1 & 5 Verification: P1=180, P2=100, P3=50, P4=200 behavior on single hole vs multiple separated holes", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // 1. Single contiguous free block: all 4 algorithms genuinely place P1 @ 0, P2 @ 180, P3 @ 280, P4 @ 330
  manager.enqueueProcess(180, 1);
  manager.enqueueProcess(100, 2);
  manager.enqueueProcess(50, 3);
  manager.enqueueProcess(200, 4);

  while (manager.queue.length > 0) {
    manager.stepSharedAllocation();
  }

  // Because only one free hole existed at every step, all 4 algorithms placed P4 at 330 MB
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.lastAction.offset, 330, "P4 placed at 330 MB when only 1 hole exists");
    assert.equal(sim.successfulCount, 4);
    assert.equal(sim.failedCount, 0);
  }

  // 2. Now deallocate P2 (100 MB @ 180 MB) to create two separated non-contiguous holes
  manager.release(2);

  // Holes in memory:
  // Hole 1: 100 MB @ offset 180 (between P1 and P3)
  // Hole 2: 494 MB @ offset 530 (after P4)
  for (const sim of manager.comparisonSimulators) {
    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.freeBlockCount, 2);
    assert.equal(frag.totalFree, 594);
    assert.equal(frag.largestFree, 494);
  }

  // Enqueue P5 = 80 MB
  manager.enqueueProcess(80, 5);
  manager.stepSharedAllocation();

  // First Fit selects first hole @ 180 MB
  const ff = manager.comparisonSimulators.find(s => s.id === "first");
  assert.equal(ff.lastAction.offset, 180);

  // Best Fit selects closest fit @ 180 MB (remainder 20 MB)
  const bf = manager.comparisonSimulators.find(s => s.id === "best");
  assert.equal(bf.lastAction.offset, 180);

  // Worst Fit selects largest hole @ 530 MB (remainder 414 MB)
  const wf = manager.comparisonSimulators.find(s => s.id === "worst");
  assert.equal(wf.lastAction.offset, 530);

  // Verify memory independence between First Fit and Worst Fit
  assert.notDeepEqual(ff.blocks, wf.blocks);
});
