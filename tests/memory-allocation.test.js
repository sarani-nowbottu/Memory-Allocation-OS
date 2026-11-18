import assert from "node:assert/strict";
import test from "node:test";
import { findAllocation, mergeFreeBlocks, placeAllocation, calculateFragmentation, simulatePolicy, compactMemory } from "../src/algorithms/memory-allocation.js";
import { ProcessManager } from "../src/process-manager.js";

test("the four policies place the sample processes at their expected offsets", () => {
  const expected = {
    first: [0, 224, 108],
    next: [0, 224, 480],
    best: [672, 224, 480],
    worst: [224, 332, 0]
  };

  for (const [policy, offsets] of Object.entries(expected)) {
    const manager = new ProcessManager();
    const actual = [];
    while (manager.queue.length) {
      const result = manager.allocateNext(policy);
      assert.equal(result.success, true);
      actual.push(result.offset);
    }
    assert.deepEqual(actual, offsets, `${policy} offsets`);
  }
});

test("freeing a process merges contiguous free blocks on both sides", () => {
  const manager = new ProcessManager();
  assert.equal(manager.release(1), true);
  assert.deepEqual(manager.blocks[0], { offset: 0, size: 640, pid: null });
});

test("a request that cannot fit remains queued and does not change memory", () => {
  const manager = new ProcessManager();
  while (manager.queue.length) manager.allocateNext("first");
  manager.enqueueProcess(1024);
  const before = manager.blocks.map(block => ({ ...block }));
  const result = manager.allocateNext("first");
  assert.equal(result.reason, "no-fit");
  assert.equal(manager.queue.at(-1).size, 1024);
  assert.deepEqual(manager.blocks, before);
});

test("block merging preserves allocated boundaries", () => {
  const merged = mergeFreeBlocks([
    { offset: 0, size: 20, pid: null },
    { offset: 20, size: 10, pid: 1 },
    { offset: 30, size: 15, pid: null }
  ]);
  assert.deepEqual(merged, [
    { offset: 0, size: 20, pid: null },
    { offset: 20, size: 10, pid: 1 },
    { offset: 30, size: 15, pid: null }
  ]);
});

test("allocation splits a block at the requested offset", () => {
  const blocks = [{ offset: 0, size: 100, pid: null }];
  const process = { pid: 1, size: 20 };
  placeAllocation(blocks, { block: blocks[0], offset: 30 }, process);
  assert.deepEqual(blocks, [
    { offset: 0, size: 30, pid: null },
    { offset: 30, size: 20, pid: 1 },
    { offset: 50, size: 50, pid: null }
  ]);
});

test("invalid process sizes are rejected", () => {
  const manager = new ProcessManager();
  assert.equal(manager.enqueueProcess(0), null);
  assert.equal(manager.enqueueProcess(1025), null);
  assert.equal(manager.queue.length, 3);
});

test("removing a process from the queue works and leaves remaining processes intact", () => {
  const manager = new ProcessManager();
  assert.equal(manager.queue.length, 3);
  assert.equal(manager.removeProcess(7), true);
  assert.equal(manager.queue.length, 2);
  assert.deepEqual(manager.queue.map(p => p.pid), [6, 8]);
  assert.equal(manager.removeProcess(999), false);
});

test("custom process ID and priority can be enqueued with duplicate rejection", () => {
  const manager = new ProcessManager();
  // P1 is already in memory blocks
  assert.equal(manager.enqueueProcess(100, 1), null);
  // P6 is already in queue
  assert.equal(manager.enqueueProcess(100, 6), null);
  // Unique PID with priority
  const added = manager.enqueueProcess(150, 12, 1);
  assert.notEqual(added, null);
  assert.equal(added.pid, 12);
  assert.equal(added.size, 150);
  assert.equal(added.priority, 1);
  assert.equal(manager.queue.at(-1).pid, 12);
});

test("external fragmentation is accurately calculated", () => {
  const blocks = [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 50, pid: 1 },
    { offset: 150, size: 200, pid: null }
  ];
  const frag = calculateFragmentation(blocks);
  assert.equal(frag.totalFree, 300);
  assert.equal(frag.largestFree, 200);
  assert.equal(frag.externalFragmentation, 100);
  assert.equal(frag.fragmentationRate, 33.3);
});

test("simulatePolicy provides complete deterministic comparison across all 4 policies", () => {
  const manager = new ProcessManager();
  const resFirst = simulatePolicy(manager.blocks, manager.queue, manager.pointer, "first");
  assert.equal(resFirst.allocationsCompleted, 3);
  assert.deepEqual(resFirst.placements.map(p => p.offset), [0, 224, 108]);

  const resWorst = simulatePolicy(manager.blocks, manager.queue, manager.pointer, "worst");
  assert.equal(resWorst.allocationsCompleted, 3);
  assert.deepEqual(resWorst.placements.map(p => p.offset), [224, 332, 0]);
});

test("releasing a process records RELEASED and MERGED events in activity log", () => {
  const manager = new ProcessManager();
  assert.equal(manager.release(1), true);
  const kinds = manager.logEntries.map(e => e.kind);
  assert.ok(kinds.includes("RELEASED"));
  assert.ok(kinds.includes("MERGED"));
});

test("all four policies correctly reject P9 (200 MB) when total free memory is 388 MB but largest block is too small", () => {
  const policies = ["best", "first", "next", "worst"];

  for (const policy of policies) {
    const manager = new ProcessManager();
    // Allocate initial sample queue (P6, P7, P8)
    while (manager.queue.length) {
      manager.allocateNext(policy);
    }

    // Now total free memory is 388 MB
    const frag = manager.getFragmentationStats();
    assert.equal(frag.totalFree, 388);
    // In Best Fit, largest free is 192 MB; for all policies, largest free block is < 200 MB
    assert.ok(frag.largestFree < 200, `Largest free block is ${frag.largestFree} MB, which is < 200 MB`);

    // P9 requests 200 MB
    const p9 = manager.enqueueProcess(200, 9);
    assert.equal(p9.pid, 9);
    assert.equal(p9.size, 200);

    const blocksBefore = manager.blocks.map(b => ({ ...b }));
    const result = manager.allocateNext(policy);

    // Allocation must fail due to external fragmentation
    assert.equal(result.success, false);
    assert.equal(result.reason, "no-fit");
    assert.equal(result.process.pid, 9);

    // P9 must remain in queue
    assert.equal(manager.queue.length, 1);
    assert.equal(manager.queue[0].pid, 9);

    // Memory layout must not be changed
    assert.deepEqual(manager.blocks, blocksBefore);

    // Activity log must record BLOCKED event
    assert.equal(manager.logEntries[0].kind, "BLOCKED");
  }
});

test("memory compaction moves allocated blocks, combines free spaces into 388 MB, and enables P9 allocation", () => {
  const manager = new ProcessManager();
  // Allocate initial queue under Best Fit
  while (manager.queue.length) {
    manager.allocateNext("best");
  }

  // Enqueue P9 (200 MB)
  manager.enqueueProcess(200, 9);
  assert.equal(manager.allocateNext("best").success, false); // Blocked!

  // Perform memory compaction
  const compactResult = manager.compact();
  assert.equal(compactResult.success, true);
  assert.equal(compactResult.totalFree, 388);
  assert.equal(compactResult.freeBlocksBefore, 4);

  // All allocated blocks are packed contiguously at the beginning (0 to 636 MB)
  const allocatedBlocks = manager.blocks.filter(b => b.pid !== null);
  const freeBlocks = manager.blocks.filter(b => b.pid === null);

  assert.equal(freeBlocks.length, 1, "Only one single contiguous free block after compaction");
  assert.equal(freeBlocks[0].offset, 636);
  assert.equal(freeBlocks[0].size, 388);

  // Process sizes must be completely unchanged
  const expectedSizes = { 1: 32, 7: 256, 8: 80, 3: 32, 6: 108, 5: 128 };
  for (const block of allocatedBlocks) {
    assert.equal(block.size, expectedSizes[block.pid], `Process ${block.pid} size preserved`);
  }

  // External fragmentation must now be 0
  const fragAfter = manager.getFragmentationStats();
  assert.equal(fragAfter.externalFragmentation, 0);
  assert.equal(fragAfter.largestFree, 388);

  // Now, allocating P9 (200 MB) must SUCCEED!
  const p9Result = manager.allocateNext("best");
  assert.equal(p9Result.success, true);
  assert.equal(p9Result.offset, 636);
  assert.equal(manager.queue.length, 0);

  // The remaining free block is now [836, 1024] = 188 MB
  const finalFree = manager.blocks.filter(b => b.pid === null);
  assert.equal(finalFree.length, 1);
  assert.equal(finalFree[0].offset, 836);
  assert.equal(finalFree[0].size, 188);
});

test("Section 9 Test Benchmark: 100 MB, 500 MB, 200 MB, 224 MB with 180 MB process allocation", () => {
  const initialBlocks = [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 500, pid: null },
    { offset: 600, size: 200, pid: null },
    { offset: 800, size: 224, pid: null }
  ];
  const process = { pid: 1, size: 180 };

  // 1. First Fit selection:
  // 100 MB too small, selects 500 MB block at offset 100
  const ffBlocks = initialBlocks.map(b => ({ ...b }));
  const ffAlloc = findAllocation(ffBlocks, process.size, "first", 0);
  assert.equal(ffAlloc.block.size, 500);
  assert.equal(ffAlloc.offset, 100);
  placeAllocation(ffBlocks, ffAlloc, process);
  assert.deepEqual(ffBlocks, [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 180, pid: 1 },
    { offset: 280, size: 320, pid: null },
    { offset: 600, size: 200, pid: null },
    { offset: 800, size: 224, pid: null }
  ]);
  const ffStats = calculateFragmentation(ffBlocks);
  assert.equal(ffStats.totalFree, 844);
  assert.equal(ffStats.largestFree, 320); // 500 MB block was consumed

  // 2. Best Fit selection:
  // Candidates >= 180 are 500, 200, 224. Smallest is 200 MB at offset 600
  const bfBlocks = initialBlocks.map(b => ({ ...b }));
  const bfAlloc = findAllocation(bfBlocks, process.size, "best", 0);
  assert.equal(bfAlloc.block.size, 200);
  assert.equal(bfAlloc.offset, 600);
  placeAllocation(bfBlocks, bfAlloc, process);
  assert.deepEqual(bfBlocks, [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 500, pid: null },
    { offset: 600, size: 180, pid: 1 },
    { offset: 780, size: 20, pid: null },
    { offset: 800, size: 224, pid: null }
  ]);
  const bfStats = calculateFragmentation(bfBlocks);
  assert.equal(bfStats.totalFree, 844);
  assert.equal(bfStats.largestFree, 500); // 500 MB block was preserved!

  // 3. Worst Fit selection:
  // Candidates >= 180 are 500, 200, 224. Largest is 500 MB at offset 100
  const wfBlocks = initialBlocks.map(b => ({ ...b }));
  const wfAlloc = findAllocation(wfBlocks, process.size, "worst", 0);
  assert.equal(wfAlloc.block.size, 500);
  assert.equal(wfAlloc.offset, 100);
  placeAllocation(wfBlocks, wfAlloc, process);
  assert.deepEqual(wfBlocks, [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 180, pid: 1 },
    { offset: 280, size: 320, pid: null },
    { offset: 600, size: 200, pid: null },
    { offset: 800, size: 224, pid: null }
  ]);

  // 4. Next Fit selection:
  // From pointer 0: selects 500 MB block at offset 100
  const nfBlocks = initialBlocks.map(b => ({ ...b }));
  const nfAlloc = findAllocation(nfBlocks, process.size, "next", 0);
  assert.equal(nfAlloc.block.size, 500);
  assert.equal(nfAlloc.offset, 100);
  placeAllocation(nfBlocks, nfAlloc, process);
  const nextPointer = (nfAlloc.offset + process.size) % 1024;
  assert.equal(nextPointer, 280);

  // From pointer 600: Next Fit selects 200 MB block at offset 600
  const nfAlloc2 = findAllocation(initialBlocks.map(b => ({ ...b })), process.size, "next", 600);
  assert.equal(nfAlloc2.block.size, 200);
  assert.equal(nfAlloc2.offset, 600);

  // 5. Deallocation and block merging:
  // Releasing P1 from Best Fit blocks merges the freed 180 MB with the 20 MB remainder and adjacent free areas
  const bfReleased = bfBlocks.map(b => b.pid === 1 ? { ...b, pid: null } : { ...b });
  const bfMerged = mergeFreeBlocks(bfReleased);
  assert.deepEqual(bfMerged, [{ offset: 0, size: 1024, pid: null }]);

  // When bounded by allocated processes, adjacent merging preserves allocated boundaries
  const boundedBlocks = [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 50, pid: 99 },
    { offset: 150, size: 80, pid: 1 },
    { offset: 230, size: 120, pid: null }
  ];
  const boundedReleased = boundedBlocks.map(b => b.pid === 1 ? { ...b, pid: null } : { ...b });
  const boundedMerged = mergeFreeBlocks(boundedReleased);
  assert.deepEqual(boundedMerged, [
    { offset: 0, size: 100, pid: null },
    { offset: 100, size: 50, pid: 99 },
    { offset: 150, size: 200, pid: null }
  ]);

  // 6. Failed allocation across all four when size exceeds all free blocks:
  // Request 600 MB (exceeds 500 MB largest block)
  for (const policy of ["first", "best", "worst", "next"]) {
    const allocFail = findAllocation(initialBlocks, 600, policy, 0);
    assert.equal(allocFail, null);
  }
});

test("TEST CASE: Reset memory to 1024 MB, enqueue P1 200 MB, allocate First Fit, verify stats, release P1", () => {
  const manager = new ProcessManager();

  // 1. Reset memory to 1024 MB clean free space
  manager.resetTo1024();
  assert.equal(manager.blocks.length, 1);
  assert.deepEqual(manager.blocks[0], { offset: 0, size: 1024, pid: null });
  assert.equal(manager.queue.length, 0);

  let stats = manager.getStats();
  assert.equal(stats.totalMemory, 1024);
  assert.equal(stats.allocatedMemory, 0);
  assert.equal(stats.allocatedCount, 0);
  assert.equal(stats.freeMemory, 1024);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 1024);
  assert.equal(stats.externalFragmentation, 0);

  // 2. Add P1 requesting 200 MB
  const p1 = manager.enqueueProcess(200, 1, 2);
  assert.notEqual(p1, null);
  assert.equal(p1.pid, 1);
  assert.equal(p1.size, 200);
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].pid, 1);
  assert.equal(manager.queue[0].size, 200);

  // 3. Allocate P1 using First Fit
  const allocResult = manager.allocateNext("first");
  assert.equal(allocResult.success, true);
  assert.equal(allocResult.offset, 0);

  // Process P1 removed from waiting queue after successful allocation
  assert.equal(manager.queue.length, 0);

  // Verify that Memory Simulator displays P1 as allocated
  const p1Block = manager.blocks.find(b => b.pid === 1);
  assert.notEqual(p1Block, undefined);
  assert.equal(p1Block.offset, 0);
  assert.equal(p1Block.size, 200);
  assert.equal(p1Block.pid, 1);

  // Verify remaining free block at offset 200 of size 824
  const freeBlock = manager.blocks.find(b => b.pid === null);
  assert.notEqual(freeBlock, undefined);
  assert.equal(freeBlock.offset, 200);
  assert.equal(freeBlock.size, 824);

  // Verify memory statistics
  stats = manager.getStats();
  assert.equal(stats.allocatedMemory, 200);
  assert.equal(stats.freeMemory, 824);
  assert.equal(stats.allocatedCount, 1);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 824);
  assert.equal(stats.externalFragmentation, 0);

  // 4. Release P1
  const releaseSuccess = manager.release(1);
  assert.equal(releaseSuccess, true);

  // Verify adjacent free blocks coalesce into 1024 MB
  assert.equal(manager.blocks.length, 1);
  assert.deepEqual(manager.blocks[0], { offset: 0, size: 1024, pid: null });

  // Verify memory statistics after release
  stats = manager.getStats();
  assert.equal(stats.allocatedMemory, 0);
  assert.equal(stats.freeMemory, 1024);
  assert.equal(stats.allocatedCount, 0);
  assert.equal(stats.freeCount, 1);
  assert.equal(stats.largestFree, 1024);
});

test("centralized simulation state synchronization across subscribers", () => {
  const manager = new ProcessManager();
  let notifications = 0;
  manager.subscribe(() => {
    notifications++;
  });

  // Reset to 1024 MB clean
  manager.resetTo1024();
  assert.ok(notifications > 0);
  const mark1 = notifications;

  // Enqueue P1 and P2
  manager.enqueueProcess(150, 1, 1);
  assert.equal(notifications, mark1 + 1);
  manager.enqueueProcess(250, 2, 2);
  assert.equal(notifications, mark1 + 2);

  // Allocate P1
  const allocP1 = manager.allocateNext("first");
  assert.equal(allocP1.success, true);
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].pid, 2);

  // Attempting to allocate an oversized process keeps it queued
  manager.enqueueProcess(900, 3, 1);
  const allocOver = manager.allocateNext("first");
  // Next in queue was P2 (250 MB), which fits in 874 MB free space
  assert.equal(allocOver.success, true);
  assert.equal(allocOver.process.pid, 2);

  // Now head of queue is P3 (900 MB). Available free space is 1024 - 150 - 250 = 624 MB.
  const allocP3Fail = manager.allocateNext("first");
  assert.equal(allocP3Fail.success, false);
  assert.equal(allocP3Fail.reason, "no-fit");
  // Process 3 stays at head of queue
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].pid, 3);
  assert.equal(manager.queue[0].size, 900);

  // Policy synchronization
  manager.setPolicy("best");
  assert.equal(manager.policy, "best");

  // Release processes and check coalescing
  manager.release(1);
  manager.release(2);
  const finalStats = manager.getStats();
  assert.equal(finalStats.allocatedMemory, 0);
  assert.equal(finalStats.freeMemory, 1024);
  assert.equal(manager.blocks.length, 1);
});
