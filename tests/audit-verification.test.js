import test from "node:test";
import assert from "node:assert/strict";
import { findAllocation, placeAllocation, mergeFreeBlocks, calculateFragmentation, compactMemory, TOTAL_MEMORY } from "../src/algorithms/memory-allocation.js";
import { ProcessManager } from "../src/process-manager.js";

test("Complete Final Audit: 1. Independent & correct allocation logic for all 4 algorithms", () => {
  const blocks = [
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

  // Request: 150 MB, pointer at 520 MB
  const allocFF = findAllocation(blocks, 150, "first", 520);
  const allocBF = findAllocation(blocks, 150, "best", 520);
  const allocWF = findAllocation(blocks, 150, "worst", 520);
  const allocNF = findAllocation(blocks, 150, "next", 520);

  // First Fit: first hole >= 150 MB is at offset 80 (size 220)
  assert.equal(allocFF.offset, 80);
  assert.equal(allocFF.block.size, 220);

  // Best Fit: closest hole >= 150 MB is at offset 340 (size 170, remainder 20 MB)
  assert.equal(allocBF.offset, 340);
  assert.equal(allocBF.block.size, 170);

  // Worst Fit: largest hole in memory is at offset 774 (size 250, remainder 100 MB)
  assert.equal(allocWF.offset, 774);
  assert.equal(allocWF.block.size, 250);

  // Next Fit: first hole after pointer 520 is at offset 550 (size 190)
  assert.equal(allocNF.offset, 550);
  assert.equal(allocNF.block.size, 190);
});

test("Complete Final Audit: 2 & 3. Process allocation, deallocation, and bidirectional coalescing", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Initial clean memory
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].size, 1024);

  // Allocate P1 (200 MB), P2 (300 MB), P3 (150 MB)
  manager.enqueueProcess(200, 1);
  manager.enqueueProcess(300, 2);
  manager.enqueueProcess(150, 3);

  manager.allocateNext("first"); // P1 @ 0..200
  manager.allocateNext("first"); // P2 @ 200..500
  manager.allocateNext("first"); // P3 @ 500..650

  assert.equal(manager.blocks.length, 4); // [P1, P2, P3, Free 374M]
  assert.equal(manager.getStats().allocatedMemory, 650);
  assert.equal(manager.getStats().freeMemory, 374);

  // Deallocate P2 (in the middle): should create a free hole at 200..500
  manager.release(2);
  assert.equal(manager.blocks.length, 4); // [P1, Free 300M, P3, Free 374M]
  assert.equal(manager.getStats().allocatedMemory, 350);
  assert.equal(manager.getStats().freeMemory, 674);

  // Deallocate P3: should coalesce with the trailing free hole (300M + 150M + 374M = 824M)
  manager.release(3);
  assert.equal(manager.blocks.length, 2); // [P1, Free 824M]
  assert.equal(manager.blocks[1].offset, 200);
  assert.equal(manager.blocks[1].size, 824);

  // Deallocate P1: should coalesce with the trailing 824M into a single 1024M block
  manager.release(1);
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.blocks[0].offset, 0);
  assert.equal(manager.blocks[0].size, 1024);
  assert.equal(manager.blocks[0].pid, null);
});

test("Complete Final Audit: 4. Memory compaction eliminates external fragmentation", () => {
  const fragmentedBlocks = [
    { offset: 0, size: 100, pid: 1 },
    { offset: 100, size: 200, pid: null }, // hole 1
    { offset: 300, size: 150, pid: 2 },
    { offset: 450, size: 300, pid: null }, // hole 2
    { offset: 750, size: 100, pid: 3 },
    { offset: 850, size: 174, pid: null }  // hole 3
  ];

  const fragBefore = calculateFragmentation(fragmentedBlocks);
  assert.equal(fragBefore.freeBlockCount, 3);
  assert.equal(fragBefore.totalFree, 674);
  assert.equal(fragBefore.largestFree, 300);
  assert.equal(fragBefore.externalFragmentation, 374); // 674 - 300 = 374 MB fragmented
  assert.ok(fragBefore.externalFragmentation > 0);

  const compacted = compactMemory(fragmentedBlocks);
  // Relocated blocks must be packed at the start
  assert.equal(compacted.blocks[0].pid, 1);
  assert.equal(compacted.blocks[0].offset, 0);
  assert.equal(compacted.blocks[0].size, 100);

  assert.equal(compacted.blocks[1].pid, 2);
  assert.equal(compacted.blocks[1].offset, 100);
  assert.equal(compacted.blocks[1].size, 150);

  assert.equal(compacted.blocks[2].pid, 3);
  assert.equal(compacted.blocks[2].offset, 250);
  assert.equal(compacted.blocks[2].size, 100);

  // Single consolidated free hole at the end
  assert.equal(compacted.blocks[3].pid, null);
  assert.equal(compacted.blocks[3].offset, 350);
  assert.equal(compacted.blocks[3].size, 674);

  const fragAfter = calculateFragmentation(compacted.blocks);
  assert.equal(fragAfter.freeBlockCount, 1);
  assert.equal(fragAfter.totalFree, 674);
  assert.equal(fragAfter.largestFree, 674);
  assert.equal(fragAfter.externalFragmentation, 0); // External fragmentation completely eliminated!
});

test("Complete Final Audit: 5. Process completion releases memory via completeProcess alias", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();
  manager.enqueueProcess(250, 10);
  manager.allocateNext("first");
  assert.equal(manager.getStats().allocatedMemory, 250);

  // Calling completeProcess must successfully release and coalesce memory
  const result = manager.completeProcess(10);
  assert.equal(result, true);
  assert.equal(manager.getStats().allocatedMemory, 0);
  assert.equal(manager.getStats().freeMemory, 1024);
  assert.equal(manager.blocks[0].pid, null);
});

test("Complete Final Audit: 6. Memory statistics invariant allocated + free === 1024 MB", () => {
  const manager = new ProcessManager();
  manager.resetToExample();

  // Test across multiple operations
  const stats1 = manager.getStats();
  assert.equal(stats1.allocatedMemory + stats1.freeMemory, TOTAL_MEMORY);

  manager.allocateNext("first");
  const stats2 = manager.getStats();
  assert.equal(stats2.allocatedMemory + stats2.freeMemory, TOTAL_MEMORY);

  manager.release(1);
  const stats3 = manager.getStats();
  assert.equal(stats3.allocatedMemory + stats3.freeMemory, TOTAL_MEMORY);

  manager.compact();
  const stats4 = manager.getStats();
  assert.equal(stats4.allocatedMemory + stats4.freeMemory, TOTAL_MEMORY);
});

test("Complete Final Audit: 7 & 8. Synchronization across modules and Reset functionality", () => {
  const manager = new ProcessManager();
  let syncCount = 0;
  manager.subscribe(() => { syncCount++; });

  // 1. Reset to clean
  manager.resetTo1024();
  assert.equal(manager.blocks.length, 1);
  assert.equal(manager.queue.length, 0);
  assert.equal(manager.pointer, 0);
  assert.equal(manager.getStats().allocatedMemory, 0);
  assert.ok(syncCount > 0);

  // 2. Activity logs record lifecycle
  const initialLogCount = manager.logEntries.length;
  manager.enqueueProcess(120, 1);
  assert.equal(manager.logEntries.length, initialLogCount + 1);
  assert.equal(manager.logEntries[0].kind, "QUEUED");

  manager.allocateNext("first");
  assert.equal(manager.logEntries[0].kind, "ALLOCATED");

  manager.release(1);
  // Releasing process logs "RELEASED" and subsequent coalescing logs "MERGED" at index 0
  assert.equal(manager.logEntries[0].kind, "MERGED");
  assert.equal(manager.logEntries[1].kind, "RELEASED");

  // 3. Clear logs
  manager.clearLog();
  assert.equal(manager.logEntries.length, 0);
});

test("Complete Final Audit: 9. Edge cases: duplicate PID, invalid sizes, exact fit, and no-fit rejection", () => {
  const manager = new ProcessManager();
  manager.resetTo1024();

  // Edge Case A: Zero or negative memory requests
  assert.equal(manager.enqueueProcess(0), null);
  assert.equal(manager.enqueueProcess(-50), null);
  assert.equal(manager.enqueueProcess(1.5), null);
  assert.equal(manager.enqueueProcess("100"), null);

  // Edge Case B: Request exceeding 1024 MB
  assert.equal(manager.enqueueProcess(1025), null);
  assert.equal(manager.enqueueProcess(2000), null);

  // Edge Case C: Duplicate Process ID
  const p1 = manager.enqueueProcess(200, 5);
  assert.notEqual(p1, null);
  assert.equal(p1.pid, 5);

  // Duplicate in queue
  assert.equal(manager.enqueueProcess(100, 5), null);

  // Duplicate after allocation
  manager.allocateNext("first");
  assert.equal(manager.enqueueProcess(100, 5), null);

  // Edge Case D: Exact fit (process size == hole size)
  // Current state: P5 (200 MB @ 0), Free hole (824 MB @ 200)
  // Request 824 MB exact fit
  manager.enqueueProcess(824, 6);
  const exactAlloc = manager.allocateNext("first");
  assert.equal(exactAlloc.success, true);
  assert.equal(manager.getStats().allocatedMemory, 1024);
  assert.equal(manager.getStats().freeMemory, 0);
  assert.equal(manager.blocks.length, 2); // [P5 (200), P6 (824)] - No empty zero-sized hole!

  // Edge Case E: Insufficient memory / no-fit rejection
  manager.enqueueProcess(50, 7);
  const rejectAlloc = manager.allocateNext("first");
  assert.equal(rejectAlloc.success, false);
  assert.equal(rejectAlloc.reason, "no-fit");
  // Process 7 stays at the head of the queue
  assert.equal(manager.queue[0].pid, 7);
  assert.equal(manager.getStats().allocatedMemory, 1024);
  assert.equal(manager.getStats().freeMemory, 0);
});
