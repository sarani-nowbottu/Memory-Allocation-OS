import test from "node:test";
import assert from "node:assert/strict";
import { ProcessManager } from "../src/process-manager.js";
import { calculateFragmentation, TOTAL_MEMORY } from "../src/algorithms/memory-allocation.js";

test("Workflow 1: Add processes (50, 100, 150, 180, 60 MB) through Process Queue and execute", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Add 5 processes through Process Queue module workflow
  const p1 = manager.enqueueProcess(50, 1, 2);
  const p2 = manager.enqueueProcess(100, 2, 2);
  const p3 = manager.enqueueProcess(150, 3, 2);
  const p4 = manager.enqueueProcess(180, 4, 2);
  const p5 = manager.enqueueProcess(60, 5, 2);

  assert.equal(manager.queue.length, 5);
  assert.deepEqual(manager.queue.map(p => p.size), [50, 100, 150, 180, 60]);

  // Run all four algorithms by allocating the queue
  while (manager.queue.length > 0) {
    const res = manager.allocateNext("first");
    assert.equal(res.success, true);
  }

  assert.equal(manager.queue.length, 0);

  // Verify all four comparison algorithms maintained independent states and correctly placed all 5 processes
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.successfulCount, 5, `${sim.label} should have 5 successful allocations`);
    assert.equal(sim.failedCount, 0, `${sim.label} should have 0 failed allocations`);

    const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
    const allocatedMemory = allocatedBlocks.reduce((sum, b) => sum + b.size, 0);
    assert.equal(allocatedMemory, 540, `${sim.label} should have 540 MB allocated`);

    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, 484, `${sim.label} free memory should be 484 MB`);
    assert.equal(allocatedMemory + frag.totalFree, TOTAL_MEMORY, "Invariant: allocated + free === 1024 MB");
  }

  // Next Fit pointer advanced to 540 MB
  const nextSim = manager.comparisonSimulators.find(s => s.id === "next");
  assert.equal(nextSim.pointer, 540, "Next fit pointer should advance to 540 MB");

  // Now release P2 (100 MB @ offset 50) and P4 (180 MB @ offset 300) to create fragmented holes
  manager.release(2);
  manager.release(4);

  for (const sim of manager.comparisonSimulators) {
    const frag = calculateFragmentation(sim.blocks);
    // Holes: 100 MB @ 50, 180 MB @ 300, 484 MB @ 540
    assert.equal(frag.freeBlockCount, 3);
    assert.equal(frag.totalFree, 764);
    assert.equal(frag.largestFree, 484);
    assert.equal(frag.externalFragmentation, 280);
  }

  // Enqueue a request of 120 MB (P6)
  const p6 = manager.enqueueProcess(120, 6, 1);
  assert.notEqual(p6, null);

  // Allocate across all 4 algorithms
  manager.stepSharedAllocation();

  // Verify divergence in decisions and offsets:
  // First Fit scans from 0: skips 100 MB hole @ 50 -> selects 180 MB hole @ 300 MB
  const firstSim = manager.comparisonSimulators.find(s => s.id === "first");
  assert.equal(firstSim.lastAction.offset, 300, "First Fit should place P6 at offset 300 MB");

  // Best Fit minimizes leftover: compares 180 MB hole (leftover 60) vs 484 MB hole (leftover 364) -> selects offset 300 MB
  const bestSim = manager.comparisonSimulators.find(s => s.id === "best");
  assert.equal(bestSim.lastAction.offset, 300, "Best Fit should place P6 at offset 300 MB");

  // Worst Fit maximizes leftover: selects 484 MB hole @ 540 MB
  const worstSim = manager.comparisonSimulators.find(s => s.id === "worst");
  assert.equal(worstSim.lastAction.offset, 540, "Worst Fit should place P6 at offset 540 MB");

  // Next Fit continues from pointer 540 MB: selects 484 MB hole @ 540 MB
  assert.equal(nextSim.lastAction.offset, 540, "Next Fit should place P6 at offset 540 MB");
});

test("Workflow 2: Add processes directly through Algorithm Comparison and verify identical independent behavior", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Simulate Algorithm Comparison adding the exact same processes: 50, 100, 150, 180, 60 MB
  const p1 = manager.enqueueProcess(50, 1);
  const p2 = manager.enqueueProcess(100, 2);
  const p3 = manager.enqueueProcess(150, 3);
  const p4 = manager.enqueueProcess(180, 4);
  const p5 = manager.enqueueProcess(60, 5);

  assert.equal(manager.queue.length, 5);

  // Run Algorithm Comparison shared queue step
  while (manager.queue.length > 0) {
    const res = manager.stepSharedAllocation();
    assert.equal(res.success, true);
  }

  assert.equal(manager.queue.length, 0);

  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.successfulCount, 5);
    assert.equal(sim.failedCount, 0);

    const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
    const allocatedMemory = allocatedBlocks.reduce((sum, b) => sum + b.size, 0);
    assert.equal(allocatedMemory, 540);

    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, 484);
  }

  // Release P2 and P4
  manager.release(2);
  manager.release(4);

  // Enqueue P6 (120 MB)
  manager.enqueueProcess(120, 6);
  manager.stepSharedAllocation();

  // Verify identical divergence
  const firstSim = manager.comparisonSimulators.find(s => s.id === "first");
  const bestSim = manager.comparisonSimulators.find(s => s.id === "best");
  const worstSim = manager.comparisonSimulators.find(s => s.id === "worst");
  const nextSim = manager.comparisonSimulators.find(s => s.id === "next");

  assert.equal(firstSim.lastAction.offset, 300);
  assert.equal(bestSim.lastAction.offset, 300);
  assert.equal(worstSim.lastAction.offset, 540);
  assert.equal(nextSim.lastAction.offset, 540);
});

test("Synchronization between Process Queue and Algorithm Comparison", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // 1. Adding in Process Queue is reflected in shared queue
  const p1 = manager.enqueueProcess(80, 1);
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].pid, 1);

  // 2. Duplicate PIDs are rejected
  assert.equal(manager.enqueueProcess(100, 1), null, "Duplicate PID 1 must be rejected");

  // 3. Removing from queue updates shared state
  const removed = manager.removeProcess(1);
  assert.equal(removed, true);
  assert.equal(manager.queue.length, 0);

  // 4. Clean reset resets both primary blocks and all 4 comparison simulators
  manager.enqueueProcess(200, 2);
  manager.stepSharedAllocation();
  assert.equal(manager.comparisonSimulators[0].successfulCount, 1);

  manager.resetTo1024();
  assert.equal(manager.getStats().allocatedMemory, 0);
  assert.equal(manager.queue.length, 0);

  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks.length, 1);
    assert.equal(sim.blocks[0].pid, null);
    assert.equal(sim.blocks[0].size, TOTAL_MEMORY);
    assert.equal(sim.successfulCount, 0);
    assert.equal(sim.failedCount, 0);
    assert.equal(sim.lastAction, null);
    assert.equal(sim.pointer, 0);
  }
});
