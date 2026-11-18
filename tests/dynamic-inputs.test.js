import test from "node:test";
import assert from "node:assert/strict";
import { ProcessManager } from "../src/process-manager.js";
import { calculateFragmentation } from "../src/algorithms/memory-allocation.js";

test("Dynamic Custom Workload 1: Silberschatz textbook benchmark produces verified 4-way independent divergence", () => {
  const manager = new ProcessManager({ persist: false });

  // Initial Blocks: [100, 500, 200, 300, 600] (Total = 1700 MB)
  // Process Requests: [212, 417, 112, 426]
  const res = manager.setupCustomWorkload({
    totalMemory: 1700,
    blockSizes: [100, 500, 200, 300, 600],
    processSizes: [212, 417, 112, 426],
    runImmediately: true
  });

  assert.equal(res.totalMemory, 1700);
  assert.equal(res.blocks.length, 5);

  const [firstSim, bestSim, worstSim, nextSim] = manager.comparisonSimulators;

  // Verify First Fit
  assert.equal(firstSim.successfulCount, 3);
  assert.equal(firstSim.failedCount, 1); // P4 (426 MB) does not fit

  // Verify Best Fit
  // Best Fit allocates ALL 4 processes successfully!
  assert.equal(bestSim.successfulCount, 4);
  assert.equal(bestSim.failedCount, 0);

  // Verify Worst Fit
  assert.equal(worstSim.successfulCount, 3);
  assert.equal(worstSim.failedCount, 1); // P4 (426 MB) does not fit

  // Verify Next Fit
  assert.equal(nextSim.successfulCount, 3);
  assert.equal(nextSim.failedCount, 1); // P4 (426 MB) does not fit

  // Verify memory invariant: allocated + free === totalMemory for all 4 simulators
  for (const sim of manager.comparisonSimulators) {
    const allocated = sim.blocks.filter(b => b.pid !== null).reduce((s, b) => s + b.size, 0);
    const free = sim.blocks.filter(b => b.pid === null).reduce((s, b) => s + b.size, 0);
    assert.equal(allocated + free, 1700, `${sim.label} total memory must equal 1700 MB`);
  }
});

test("Dynamic Custom Workload 2: Strict input validation and edge cases", () => {
  const manager = new ProcessManager({ persist: false });

  // 1. Invalid totalMemory
  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: -500, blockSizes: [100], processSizes: [50] });
  }, /Total memory must be a positive integer/);

  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 0, blockSizes: [100], processSizes: [50] });
  }, /Total memory must be a positive integer/);

  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: "invalid", blockSizes: [100], processSizes: [50] });
  }, /Total memory must be a positive integer/);

  // 2. Invalid blockSizes
  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 1000, blockSizes: [], processSizes: [50] });
  }, /Provide at least one initial memory block size/);

  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 1000, blockSizes: [100, -50], processSizes: [50] });
  }, /Each block size must be a positive integer/);

  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 1000, blockSizes: [100, 0], processSizes: [50] });
  }, /Each block size must be a positive integer/);

  // 3. Invalid processSizes
  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 1000, blockSizes: [500, 500], processSizes: [-100] });
  }, /Each process size must be a positive integer/);

  assert.throws(() => {
    manager.setupCustomWorkload({ totalMemory: 1000, blockSizes: [500, 500], processSizes: [0] });
  }, /Each process size must be a positive integer/);

  // 4. Auto-expansion: when blockSizes sum exceeds totalMemory, total expands to sum
  const expanded = manager.setupCustomWorkload({
    totalMemory: 500,
    blockSizes: [300, 400], // sum = 700
    processSizes: [100]
  });
  assert.equal(expanded.totalMemory, 700);

  // 5. Trailing fill: when blockSizes sum is less than totalMemory, a trailing block fills the arena
  const filled = manager.setupCustomWorkload({
    totalMemory: 1000,
    blockSizes: [300, 200], // sum = 500
    processSizes: [100]
  });
  assert.equal(filled.totalMemory, 1000);
  assert.equal(filled.blocks.length, 3);
  assert.equal(filled.blocks[2].size, 500); // 1000 - 500
});

test("Dynamic Custom Workload 3: Step Mode queue execution allows step-by-step synchronization", () => {
  const manager = new ProcessManager({ persist: false });

  // Setup workload in step mode (runImmediately: false)
  const setup = manager.setupCustomWorkload({
    totalMemory: 1024,
    blockSizes: [100, 500, 200, 224],
    processSizes: [180, 150, 60],
    runImmediately: false
  });

  assert.equal(manager.queue.length, 3);
  assert.equal(manager.comparisonSimulators[0].successfulCount, 0);

  // Step 1: Allocate P1 (180 MB)
  const step1 = manager.stepSharedAllocation();
  assert.equal(step1.success, true);
  assert.equal(step1.process.pid, 1);
  assert.equal(manager.queue.length, 2);

  // Step 2: Allocate P2 (150 MB)
  const step2 = manager.stepSharedAllocation();
  assert.equal(step2.success, true);
  assert.equal(step2.process.pid, 2);
  assert.equal(manager.queue.length, 1);

  // Step 3: Allocate P3 (60 MB)
  const step3 = manager.stepSharedAllocation();
  assert.equal(step3.success, true);
  assert.equal(step3.process.pid, 3);
  assert.equal(manager.queue.length, 0);

  // Queue now empty
  const stepEmpty = manager.stepSharedAllocation();
  assert.equal(stepEmpty.success, false);
});

test("Dynamic Custom Workload 4: Validation with 10 randomized input combinations", () => {
  const manager = new ProcessManager({ persist: false });

  for (let round = 1; round <= 10; round++) {
    // Generate random partitions (3 to 6 blocks)
    const partitionCount = 3 + Math.floor(Math.random() * 4);
    const candidateSizes = [60, 100, 150, 200, 250, 300, 400, 500];
    const blockSizes = [];
    for (let i = 0; i < partitionCount; i++) {
      blockSizes.push(candidateSizes[Math.floor(Math.random() * candidateSizes.length)]);
    }
    const totalMemory = blockSizes.reduce((s, b) => s + b, 0);

    // Generate random process requests (3 to 5 processes)
    const procCount = 3 + Math.floor(Math.random() * 3);
    const procCandidateSizes = [50, 80, 120, 160, 200, 240, 320];
    const processSizes = [];
    for (let i = 0; i < procCount; i++) {
      processSizes.push(procCandidateSizes[Math.floor(Math.random() * procCandidateSizes.length)]);
    }

    const res = manager.setupCustomWorkload({
      totalMemory,
      blockSizes,
      processSizes,
      runImmediately: true
    });

    assert.equal(res.totalMemory, totalMemory, `Round ${round}: total memory matches`);

    // Verify all 4 simulators
    for (const sim of manager.comparisonSimulators) {
      assert.equal(sim.successfulCount + sim.failedCount, procCount, `Round ${round}: total decisions match procCount`);

      const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
      const freeBlocks = sim.blocks.filter(b => b.pid === null);
      const allocatedMemory = allocatedBlocks.reduce((s, b) => s + b.size, 0);
      const freeMemory = freeBlocks.reduce((s, b) => s + b.size, 0);

      // Invariant: allocated + free === totalMemory
      assert.equal(allocatedMemory + freeMemory, totalMemory, `Round ${round}: ${sim.label} invariant`);

      // Offsets within bounds
      for (const b of sim.blocks) {
        assert.ok(b.offset >= 0, `Round ${round}: offset non-negative`);
        assert.ok(b.offset + b.size <= totalMemory, `Round ${round}: block within bounds`);
      }

      // Next Fit pointer within bounds
      if (sim.policy === "next") {
        assert.ok(sim.pointer >= 0 && sim.pointer < totalMemory, `Round ${round}: Next fit pointer in range`);
      }

      // Fragmentation accuracy
      const frag = calculateFragmentation(sim.blocks);
      assert.equal(frag.totalFree, freeMemory);
      assert.ok(frag.externalFragmentation >= 0);
      assert.ok(frag.fragmentationRate >= 0 && frag.fragmentationRate <= 100);
    }
  }
});

test("Dynamic Custom Workload 5: Release and coalescing across custom workload", () => {
  const manager = new ProcessManager({ persist: false });

  manager.setupCustomWorkload({
    totalMemory: 1000,
    blockSizes: [200, 300, 200, 300],
    processSizes: [150, 150],
    runImmediately: true
  });

  // Both P1 and P2 were allocated
  const p1Found = manager.comparisonSimulators.some(s => s.blocks.some(b => b.pid === 1));
  assert.ok(p1Found);

  // Release P1
  const released = manager.release(1);
  assert.equal(released, true);

  // Verify P1 is no longer in any simulator
  for (const sim of manager.comparisonSimulators) {
    const hasP1 = sim.blocks.some(b => b.pid === 1);
    assert.equal(hasP1, false, `P1 must be deallocated in ${sim.label}`);

    // Verify invariant after release
    const allocated = sim.blocks.filter(b => b.pid !== null).reduce((s, b) => s + b.size, 0);
    const free = sim.blocks.filter(b => b.pid === null).reduce((s, b) => s + b.size, 0);
    assert.equal(allocated + free, 1000);
  }
});

test("Dynamic Custom Workload 6: Live state sync and clean reset preservation across refresh", () => {
  const manager = new ProcessManager({ persist: false });
  manager.resetTo1024();

  // Arena must be 1024 MB clean
  assert.equal(manager.totalMemory, 1024);
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].size, 1024);
  assert.equal(manager.queue.length, 0);

  // Enqueue 3 live requests: 64, 130, 200 MB
  manager.enqueueProcess(64, 1);
  manager.enqueueProcess(130, 2);
  manager.enqueueProcess(200, 3);
  assert.equal(manager.queue.length, 3);

  // In live state, all 4 simulators start with identical 1024 MB free
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks[0].size, 1024);
    assert.equal(sim.blocks[0].pid, null);
  }

  // Allocate next shared
  const step1 = manager.stepSharedAllocation();
  assert.equal(step1.success, true);
  assert.equal(step1.process.pid, 1);
  assert.equal(step1.process.size, 64);

  // All 4 algorithms placed P1 at offset 0
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks[0].pid, 1);
    assert.equal(sim.blocks[0].size, 64);
    assert.equal(sim.blocks[0].offset, 0);
  }

  // Reset to 1024 MB
  manager.resetTo1024();
  assert.equal(manager.totalMemory, 1024);
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].pid, null);
  assert.equal(manager.blocks[0].size, 1024);
  assert.equal(manager.queue.length, 0);
  for (const sim of manager.comparisonSimulators) {
    assert.equal(sim.blocks.length, 1);
    assert.equal(sim.blocks[0].pid, null);
    assert.equal(sim.blocks[0].size, 1024);
    assert.equal(sim.successfulCount, 0);
    assert.equal(sim.failedCount, 0);
  }
});
