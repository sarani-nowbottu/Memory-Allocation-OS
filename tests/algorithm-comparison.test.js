import test from "node:test";
import assert from "node:assert/strict";
import { findAllocation, placeAllocation, mergeFreeBlocks, calculateFragmentation, TOTAL_MEMORY } from "../src/algorithms/memory-allocation.js";

test("Four algorithms maintain independent 1024 MB states and accurately allocate 100 MB, 200 MB, 64 MB, and 300 MB", () => {
  const policies = ["first", "best", "worst", "next"];
  const testRequests = [
    { pid: 1, size: 100 },
    { pid: 2, size: 200 },
    { pid: 3, size: 64 },
    { pid: 4, size: 300 }
  ];

  // Initialize four independent simulators with clean 1024 MB state
  const simulators = {};
  for (const policy of policies) {
    simulators[policy] = {
      blocks: [{ offset: 0, size: TOTAL_MEMORY, pid: null }],
      pointer: 0,
      successfulCount: 0,
      failedCount: 0,
      history: []
    };
  }

  // Allocate all 4 test processes across each algorithm independently
  for (const proc of testRequests) {
    for (const policy of policies) {
      const sim = simulators[policy];
      const placement = findAllocation(sim.blocks, proc.size, policy, sim.pointer);

      assert.notEqual(placement, null, `${policy} should find placement for P${proc.pid} (${proc.size} MB)`);
      placeAllocation(sim.blocks, placement, proc);

      if (policy === "next") {
        sim.pointer = (placement.offset + proc.size) % TOTAL_MEMORY;
      }
      sim.successfulCount++;
      sim.history.push({ pid: proc.pid, offset: placement.offset, size: proc.size });
    }
  }

  // Verify that all four algorithms placed processes at sequential offsets initially
  for (const policy of policies) {
    const sim = simulators[policy];
    assert.equal(sim.successfulCount, 4);
    assert.equal(sim.failedCount, 0);

    // Offsets: P1 @ 0, P2 @ 100, P3 @ 300, P4 @ 364
    assert.deepEqual(sim.history.map(h => h.offset), [0, 100, 300, 364], `${policy} offsets match`);

    const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
    const allocatedMemory = allocatedBlocks.reduce((sum, b) => sum + b.size, 0);
    assert.equal(allocatedMemory, 664);

    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, 360);
    assert.equal(frag.largestFree, 360);
    assert.equal(frag.freeBlockCount, 1);
    assert.equal(frag.externalFragmentation, 0);
  }

  // Next Fit pointer must be at 664 MB
  assert.equal(simulators.next.pointer, 664);

  // Now release P2 (200 MB @ offset 100) from all four simulators
  for (const policy of policies) {
    const sim = simulators[policy];
    const block = sim.blocks.find(b => b.pid === 2);
    assert.notEqual(block, undefined);
    block.pid = null;
    sim.blocks = mergeFreeBlocks(sim.blocks);

    const frag = calculateFragmentation(sim.blocks);
    // Two free holes: 200 MB @ 100, and 360 MB @ 664
    assert.equal(frag.freeBlockCount, 2);
    assert.equal(frag.totalFree, 560);
    assert.equal(frag.largestFree, 360);
    assert.equal(frag.externalFragmentation, 200);
  }

  // Now allocate P5 requesting 180 MB
  // Demonstrating divergence:
  // First Fit -> selects 200 MB hole @ offset 100 MB
  // Best Fit  -> selects 200 MB hole @ offset 100 MB (remainder 20 MB < 180 MB)
  // Worst Fit -> selects 360 MB hole @ offset 664 MB (largest hole)
  // Next Fit  -> continues from pointer 664 MB -> selects 360 MB hole @ offset 664 MB
  const p5 = { pid: 5, size: 180 };
  const p5Results = {};

  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, p5.size, policy, sim.pointer);
    assert.notEqual(placement, null);
    p5Results[policy] = placement.offset;

    placeAllocation(sim.blocks, placement, p5);
    if (policy === "next") {
      sim.pointer = (placement.offset + p5.size) % TOTAL_MEMORY;
    }
  }

  assert.equal(p5Results.first, 100, "First Fit selects first hole @ 100 MB");
  assert.equal(p5Results.best, 100, "Best Fit selects closest hole @ 100 MB");
  assert.equal(p5Results.worst, 664, "Worst Fit selects largest hole @ 664 MB");
  assert.equal(p5Results.next, 664, "Next Fit scans from pointer @ 664 MB");

  // Verify memory independence: Worst Fit and Next Fit have different remaining free holes from First and Best Fit
  const firstFrag = calculateFragmentation(simulators.first.blocks);
  const worstFrag = calculateFragmentation(simulators.worst.blocks);

  // In First Fit, the remaining holes are: 20 MB @ 280, and 360 MB @ 664 (largest free = 360 MB)
  assert.equal(firstFrag.largestFree, 360);

  // In Worst Fit, the remaining holes are: 200 MB @ 100, and 180 MB @ 844 (largest free = 200 MB)
  assert.equal(worstFrag.largestFree, 200);

  // Now allocate P6 requesting 250 MB
  // First Fit and Best Fit CAN allocate (in 360 MB hole)
  // Worst Fit and Next Fit CANNOT allocate (largest hole is 200 MB < 250 MB)
  const p6 = { pid: 6, size: 250 };
  const allocFF = findAllocation(simulators.first.blocks, p6.size, "first", simulators.first.pointer);
  const allocBF = findAllocation(simulators.best.blocks, p6.size, "best", simulators.best.pointer);
  const allocWF = findAllocation(simulators.worst.blocks, p6.size, "worst", simulators.worst.pointer);
  const allocNF = findAllocation(simulators.next.blocks, p6.size, "next", simulators.next.pointer);

  assert.notEqual(allocFF, null, "First Fit succeeds because 360 MB hole was preserved");
  assert.equal(allocFF.offset, 664);

  assert.notEqual(allocBF, null, "Best Fit succeeds because 360 MB hole was preserved");
  assert.equal(allocBF.offset, 664);

  assert.equal(allocWF, null, "Worst Fit FAILS because largest hole (200 MB) < 250 MB");
  assert.equal(allocNF, null, "Next Fit FAILS because largest hole (200 MB) < 250 MB");
});

test("Demonstration Scenario: First Fit, Best Fit, Worst Fit, and Next Fit produce 4 distinct allocation decisions", () => {
  const policies = ["first", "best", "worst", "next"];
  const initialBlocks = [
    { offset: 0, size: 50, pid: null },
    { offset: 50, size: 30, pid: 1 },
    { offset: 80, size: 220, pid: null },
    { offset: 300, size: 40, pid: 2 },
    { offset: 340, size: 170, pid: null },
    { offset: 510, size: 40, pid: 3 },
    { offset: 550, size: 190, pid: null },
    { offset: 740, size: 34, pid: 4 },
    { offset: 774, size: 250, pid: null }
  ];
  const initialPointer = 520;

  const simulators = {};
  for (const policy of policies) {
    simulators[policy] = {
      blocks: initialBlocks.map(b => ({ ...b })),
      pointer: initialPointer,
      successfulCount: 0,
      failedCount: 0
    };
  }

  // Evaluate P5 (150 MB) across all four algorithms
  const p5 = { pid: 5, size: 150 };
  const p5Placements = {};

  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, p5.size, policy, sim.pointer);
    assert.notEqual(placement, null, `${policy} should find a block for 150 MB`);
    p5Placements[policy] = placement.offset;

    placeAllocation(sim.blocks, placement, p5);
    if (policy === "next") {
      sim.pointer = (placement.offset + p5.size) % TOTAL_MEMORY;
    }
  }

  // Verify that all 4 algorithms selected completely DIFFERENT offsets
  assert.equal(p5Placements.first, 80, "First Fit selects 220 MB hole @ 80 MB");
  assert.equal(p5Placements.best, 340, "Best Fit selects closest 170 MB hole @ 340 MB (20 MB remainder)");
  assert.equal(p5Placements.next, 550, "Next Fit scans forward from pointer 520 to 190 MB hole @ 550 MB");
  assert.equal(p5Placements.worst, 774, "Worst Fit selects largest 250 MB hole @ 774 MB (100 MB remainder)");

  const distinctOffsets = new Set(Object.values(p5Placements));
  assert.equal(distinctOffsets.size, 4, "All 4 algorithms made completely distinct allocation decisions!");

  // Next Fit pointer advanced to 550 + 150 = 700 MB
  assert.equal(simulators.next.pointer, 700);

  // Now allocate P6 (180 MB)
  const p6 = { pid: 6, size: 180 };
  const p6Placements = {};

  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, p6.size, policy, sim.pointer);
    assert.notEqual(placement, null, `${policy} should find a block for 180 MB`);
    p6Placements[policy] = placement.offset;

    placeAllocation(sim.blocks, placement, p6);
    if (policy === "next") {
      sim.pointer = (placement.offset + p6.size) % TOTAL_MEMORY;
    }
  }

  // Next Fit (pointer at 700 MB) places into the 250 MB hole @ 774 MB
  assert.equal(p6Placements.next, 774);
  assert.equal(simulators.next.pointer, (774 + 180) % TOTAL_MEMORY);

  // Worst Fit (largest available hole is 220 MB @ 80 MB, since 774 MB hole was reduced to 100 MB by P5)
  assert.equal(p6Placements.worst, 80);

  // First Fit places into 190 MB hole @ 550 MB (since hole @ 80 was reduced to 70 MB < 180)
  assert.equal(p6Placements.first, 550);

  // Best Fit places into 190 MB hole @ 550 MB (closest fit, 10 MB remainder)
  assert.equal(p6Placements.best, 550);

  // Verify Release coalescing: Release P1 (30 MB @ 50 MB) from all simulators
  for (const policy of policies) {
    const sim = simulators[policy];
    const p1Block = sim.blocks.find(b => b.pid === 1);
    assert.notEqual(p1Block, undefined);
    p1Block.pid = null;
    sim.blocks = mergeFreeBlocks(sim.blocks);

    // Free block at offset 0 (50 MB) and freed P1 (30 MB) coalesce into a single block of at least 80 MB
    const firstBlock = sim.blocks[0];
    assert.equal(firstBlock.offset, 0);
    assert.equal(firstBlock.pid, null);
    assert.ok(firstBlock.size >= 80, "Adjacent free blocks coalesced at offset 0");
  }
});

test("Algorithm Comparison verification: mathematical invariant, counters, and coalescing", () => {
  const policies = ["first", "best", "worst", "next"];
  const simulators = {};
  for (const policy of policies) {
    simulators[policy] = {
      policy,
      blocks: [
        { offset: 0, size: 100, pid: null },
        { offset: 100, size: 50, pid: 10 },
        { offset: 150, size: 250, pid: null },
        { offset: 400, size: 50, pid: 11 },
        { offset: 450, size: 200, pid: null },
        { offset: 650, size: 50, pid: 12 },
        { offset: 700, size: 324, pid: null }
      ],
      pointer: 400,
      successfulCount: 0,
      failedCount: 0
    };
  }

  function verifyMathInvariants(sim, label) {
    // 1. Total memory sum must equal 1024 MB
    let runningOffset = 0;
    let sumAllocated = 0;
    let sumFree = 0;

    for (const b of sim.blocks) {
      assert.equal(b.offset, runningOffset, `${label}: Block offset ${b.offset} must match running address ${runningOffset}`);
      assert.ok(b.size > 0, `${label}: Block size must be positive`);
      if (b.pid !== null) {
        sumAllocated += b.size;
      } else {
        sumFree += b.size;
      }
      runningOffset += b.size;
    }

    assert.equal(runningOffset, TOTAL_MEMORY, `${label}: Total address space must end at 1,024 MB`);
    assert.equal(sumAllocated + sumFree, TOTAL_MEMORY, `${label}: Allocated (${sumAllocated}) + Free (${sumFree}) must strictly equal 1,024 MB`);

    // 2. Fragmentation calculations
    const frag = calculateFragmentation(sim.blocks);
    assert.equal(frag.totalFree, sumFree, `${label}: Calculated free memory must match actual free sum`);
    if (frag.freeBlockCount > 1) {
      assert.equal(frag.externalFragmentation, frag.totalFree - frag.largestFree);
      assert.equal(frag.fragmentationRate, Number(((frag.externalFragmentation / frag.totalFree) * 100).toFixed(1)));
    } else {
      assert.equal(frag.externalFragmentation, 0);
    }
  }

  // Verify initial state
  for (const policy of policies) {
    verifyMathInvariants(simulators[policy], `${policy} (initial)`);
  }

  // Test 1: Allocate P20 (180 MB)
  // Candidate free blocks: 250 MB @ 150, 200 MB @ 450, 324 MB @ 700
  // First Fit -> 250 MB @ 150 (first)
  // Best Fit  -> 200 MB @ 450 (closest: leftover 20 MB)
  // Next Fit  -> 200 MB @ 450 (first after pointer 400)
  // Worst Fit -> 324 MB @ 700 (largest: 324 MB)
  const p20 = { pid: 20, size: 180 };
  const p20Offsets = {};

  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, p20.size, policy, sim.pointer);
    assert.notEqual(placement, null);
    p20Offsets[policy] = placement.offset;

    placeAllocation(sim.blocks, placement, p20);
    if (policy === "next") {
      sim.pointer = (placement.offset + p20.size) % TOTAL_MEMORY;
    }
    sim.successfulCount++;

    verifyMathInvariants(sim, `${policy} (after P20)`);
  }

  assert.equal(p20Offsets.first, 150, "First Fit chose 250 MB hole @ 150");
  assert.equal(p20Offsets.best, 450, "Best Fit chose 200 MB hole @ 450 (min leftover: 20 MB)");
  assert.equal(p20Offsets.next, 450, "Next Fit chose 200 MB hole @ 450 (pointer was 400)");
  assert.equal(p20Offsets.worst, 700, "Worst Fit chose 324 MB hole @ 700 (largest)");

  // Test 2: Process too large (400 MB) -> all must reject without altering memory
  const pFail = { pid: 99, size: 400 };
  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, pFail.size, policy, sim.pointer);
    assert.equal(placement, null, `${policy} must reject 400 MB request`);
    sim.failedCount++;

    // Memory state must remain completely unaltered
    verifyMathInvariants(sim, `${policy} (after failed P99)`);
    assert.equal(sim.successfulCount, 1);
    assert.equal(sim.failedCount, 1);
  }

  // Test 3: Release process P11 (50 MB @ 400 MB)
  // In First Fit: Free block before was 250 - 180 = 70 MB @ 330.
  // P11 is at 400. Free block after P11 is 200 MB @ 450.
  // When P11 (50 MB) is freed: 70 MB (330-400) + 50 MB (400-450) + 200 MB (450-650)
  // coalesces into a huge contiguous hole of 320 MB (from 330 to 650)!
  for (const policy of policies) {
    const sim = simulators[policy];
    const p11Block = sim.blocks.find(b => b.pid === 11);
    assert.notEqual(p11Block, undefined);
    p11Block.pid = null;
    sim.blocks = mergeFreeBlocks(sim.blocks);

    verifyMathInvariants(sim, `${policy} (after releasing P11)`);
  }

  // Verify that coalesced block in First Fit has size 320 MB (330 to 650)
  const ffCoalesced = simulators.first.blocks.find(b => b.offset === 330);
  assert.notEqual(ffCoalesced, undefined);
  assert.equal(ffCoalesced.pid, null);
  assert.equal(ffCoalesced.size, 320, "First Fit coalesced 70 + 50 + 200 into 320 MB");

  // Verify Next Fit wrap-around
  // Set pointer to 980 (only 44 MB remaining at end of memory). Request of 80 MB must wrap around to offset 0 (size 100 MB).
  simulators.next.pointer = 980;
  const pWrap = { pid: 30, size: 80 };
  const allocWrap = findAllocation(simulators.next.blocks, pWrap.size, "next", simulators.next.pointer);
  assert.notEqual(allocWrap, null, "Next Fit must wrap around when no block after 980 fits");
  assert.equal(allocWrap.offset, 0, "Next Fit wrapped around to hole at offset 0");
});

test("Section 5 Benchmark Scenario: 300 MB, 500 MB, 200 MB free holes separated by allocated processes with 180 MB request", () => {
  const policies = ["first", "best", "worst", "next"];
  // Initial layout:
  // Offset 0: 300 MB free
  // Offset 300: 12 MB allocated (P1)
  // Offset 312: 500 MB free
  // Offset 812: 12 MB allocated (P2)
  // Offset 824: 200 MB free
  const initialBlocks = [
    { offset: 0, size: 300, pid: null },
    { offset: 300, size: 12, pid: 1 },
    { offset: 312, size: 500, pid: null },
    { offset: 812, size: 12, pid: 2 },
    { offset: 824, size: 200, pid: null }
  ];
  // Start Next Fit pointer at 312 MB
  const initialPointer = 312;

  const simulators = {};
  for (const policy of policies) {
    simulators[policy] = {
      blocks: initialBlocks.map(b => ({ ...b })),
      pointer: initialPointer,
      successfulCount: 0,
      failedCount: 0
    };
  }

  // Request: P3 = 180 MB
  const p3 = { pid: 3, size: 180 };
  const placements = {};

  for (const policy of policies) {
    const sim = simulators[policy];
    const placement = findAllocation(sim.blocks, p3.size, policy, sim.pointer);
    assert.notEqual(placement, null, `${policy} must find a placement for 180 MB`);
    placements[policy] = {
      offset: placement.offset,
      blockSize: placement.block.size,
      blockOffset: placement.block.offset
    };

    placeAllocation(sim.blocks, placement, p3);
    if (policy === "next") {
      sim.pointer = (placement.offset + p3.size) % TOTAL_MEMORY;
    }
  }

  // Verify Section 5 requirements:
  // 1. First Fit selects 300 MB block @ offset 0
  assert.equal(placements.first.offset, 0);
  assert.equal(placements.first.blockOffset, 0);
  assert.equal(placements.first.blockSize, 300);

  // 2. Best Fit selects 200 MB block @ offset 824 (smallest suitable block, min leftover 20 MB)
  assert.equal(placements.best.offset, 824);
  assert.equal(placements.best.blockOffset, 824);
  assert.equal(placements.best.blockSize, 200);

  // 3. Worst Fit selects 500 MB block @ offset 312 (largest suitable block, max leftover 320 MB)
  assert.equal(placements.worst.offset, 312);
  assert.equal(placements.worst.blockOffset, 312);
  assert.equal(placements.worst.blockSize, 500);

  // 4. Next Fit searches from pointer 312 MB and selects 500 MB block @ offset 312
  assert.equal(placements.next.offset, 312);
  assert.equal(placements.next.blockOffset, 312);
  assert.equal(placements.next.blockSize, 500);
  assert.equal(simulators.next.pointer, 492, "Next fit pointer advances to 312 + 180 = 492");

  // Verify memory statistics after allocation
  for (const policy of policies) {
    const sim = simulators[policy];
    const allocated = sim.blocks.filter(b => b.pid !== null).reduce((s, b) => s + b.size, 0);
    const free = sim.blocks.filter(b => b.pid === null).reduce((s, b) => s + b.size, 0);
    assert.equal(allocated + free, 1024, "Total memory invariant holds");
    assert.equal(allocated, 12 + 12 + 180, "Allocated memory is 204 MB");
    assert.equal(free, 820, "Free memory is 820 MB");
  }

  // Verify fragmentation divergence:
  // In First Fit: remaining holes are 120 MB @ 180, 500 MB @ 312, 200 MB @ 824. Largest = 500 MB. Ext Frag = 820 - 500 = 320 MB.
  const ffFrag = calculateFragmentation(simulators.first.blocks);
  assert.equal(ffFrag.largestFree, 500);
  assert.equal(ffFrag.externalFragmentation, 320);

  // In Best Fit: remaining holes are 300 MB @ 0, 500 MB @ 312, 20 MB @ 1004. Largest = 500 MB. Ext Frag = 820 - 500 = 320 MB.
  const bfFrag = calculateFragmentation(simulators.best.blocks);
  assert.equal(bfFrag.largestFree, 500);
  assert.equal(bfFrag.freeBlockCount, 3);

  // In Worst Fit: remaining holes are 300 MB @ 0, 320 MB @ 492, 200 MB @ 824. Largest = 320 MB. Ext Frag = 820 - 320 = 500 MB.
  const wfFrag = calculateFragmentation(simulators.worst.blocks);
  assert.equal(wfFrag.largestFree, 320);
  assert.equal(wfFrag.externalFragmentation, 500);

  // Release P1 (12 MB @ offset 300) in First Fit:
  // Leftover 120 MB (180-300) + P1 (12 MB @ 300) + 500 MB (312-812) coalesces into 632 MB!
  const p1BlockFF = simulators.first.blocks.find(b => b.pid === 1);
  p1BlockFF.pid = null;
  simulators.first.blocks = mergeFreeBlocks(simulators.first.blocks);
  const coalescedFF = simulators.first.blocks.find(b => b.offset === 180);
  assert.notEqual(coalescedFF, undefined);
  assert.equal(coalescedFF.size, 632, "120 MB + 12 MB + 500 MB coalesced into 632 MB");
});
