import { findAllocation, mergeFreeBlocks, placeAllocation, TOTAL_MEMORY, POLICY_LABELS, calculateFragmentation, compactMemory } from "./algorithms/memory-allocation.js";

const INITIAL_BLOCKS = [
  { offset: 0, size: 192, pid: null },
  { offset: 192, size: 32, pid: 1 },
  { offset: 224, size: 416, pid: null },
  { offset: 640, size: 32, pid: 3 },
  { offset: 672, size: 160, pid: null },
  { offset: 832, size: 128, pid: 5 },
  { offset: 960, size: 64, pid: null }
];
const INITIAL_QUEUE = [
  { pid: 6, size: 108, priority: 2, cpu: 1 },
  { pid: 7, size: 256, priority: 2, cpu: 1 },
  { pid: 8, size: 80, priority: 2, cpu: 1 }
];

export const STORAGE_KEY = "memlab_simulation_state";

export class ProcessManager {
  constructor(options = {}) {
    this.listeners = new Set();
    this.policy = "first";
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.autoPersist = options.persist !== false;
    this.totalMemory = options.totalMemory || TOTAL_MEMORY;

    this.initComparisonSimulators();

    const loaded = options.initialMode ? false : this.loadFromStorage();
    if (!loaded) {
      if (options.initialMode === "example") {
        this.resetToExample(false);
      } else if (options.initialMode === "clean" || options.initialMode === "1024") {
        this.resetTo1024(false);
      } else if (typeof window !== "undefined") {
        // Browser environment without saved state: start with clean 1,024 MB arena (Requirement 7)
        this.resetTo1024(false);
      } else {
        // Node.js test environment without explicit mode or localStorage:
        // maintain default for existing test suites
        this.resetToExample(false);
      }
    }
  }

  initComparisonSimulators() {
    const total = this.totalMemory || TOTAL_MEMORY;
    this.comparisonSimulators = [
      { id: "first", label: "First Fit", policy: "first", blocks: [{ offset: 0, size: total, pid: null }], pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "best", label: "Best Fit", policy: "best", blocks: [{ offset: 0, size: total, pid: null }], pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "worst", label: "Worst Fit", policy: "worst", blocks: [{ offset: 0, size: total, pid: null }], pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "next", label: "Next Fit", policy: "next", blocks: [{ offset: 0, size: total, pid: null }], pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null }
    ];
  }

  saveState() {
    if (!this.autoPersist) return false;
    try {
      const state = {
        version: 1,
        savedAt: Date.now(),
        totalMemory: this.totalMemory || TOTAL_MEMORY,
        blocks: this.blocks.map(b => ({
          offset: b.offset,
          size: b.size,
          pid: b.pid !== null && b.pid !== undefined ? b.pid : null
        })),
        queue: this.queue.map(p => ({
          pid: p.pid,
          size: p.size,
          priority: p.priority,
          cpu: p.cpu
        })),
        policy: this.policy,
        pointer: this.pointer,
        nextPid: this.nextPid,
        elapsedSeconds: this.elapsedSeconds,
        logCounter: this.logCounter,
        logEntries: this.logEntries.slice(0, 100),
        comparisonSimulators: this.comparisonSimulators ? this.comparisonSimulators.map(sim => ({
          id: sim.id,
          policy: sim.policy,
          blocks: sim.blocks.map(b => ({
            offset: b.offset,
            size: b.size,
            pid: b.pid !== null && b.pid !== undefined ? b.pid : null
          })),
          pointer: sim.pointer,
          successfulCount: sim.successfulCount,
          failedCount: sim.failedCount,
          lastAction: sim.lastAction,
          recentlyAllocatedPid: sim.recentlyAllocatedPid
        })) : []
      };
      const serialized = JSON.stringify(state);
      if (typeof localStorage !== "undefined") {
        try { localStorage.setItem(this.storageKey, serialized); } catch {}
      }
      if (typeof sessionStorage !== "undefined") {
        try { sessionStorage.setItem(this.storageKey, serialized); } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }

  loadFromStorage() {
    let raw = null;
    if (typeof localStorage !== "undefined") {
      try { raw = localStorage.getItem(this.storageKey); } catch {}
    }
    if (!raw && typeof sessionStorage !== "undefined") {
      try { raw = sessionStorage.getItem(this.storageKey); } catch {}
    }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return false;

      // Validate blocks array
      if (!Array.isArray(data.blocks) || data.blocks.length === 0) return false;

      const targetTotal = typeof data.totalMemory === "number" && data.totalMemory > 0
        ? data.totalMemory
        : TOTAL_MEMORY;

      let totalSize = 0;
      for (const b of data.blocks) {
        if (!b || typeof b !== "object") return false;
        if (typeof b.offset !== "number" || typeof b.size !== "number" || b.size <= 0) return false;
        totalSize += b.size;
      }
      if (totalSize !== targetTotal) return false;

      this.totalMemory = targetTotal;

      this.blocks = data.blocks.map(b => ({
        offset: b.offset,
        size: b.size,
        pid: b.pid !== null && b.pid !== undefined ? Number(b.pid) : null
      }));

      // Validate queue
      if (Array.isArray(data.queue)) {
        this.queue = data.queue
          .filter(p => p && typeof p.size === "number" && p.size > 0)
          .map(p => ({
            pid: Number(p.pid),
            size: Number(p.size),
            priority: Number(p.priority) || 2,
            cpu: Number(p.cpu) || 1
          }));
      } else {
        this.queue = [];
      }

      // Validate policy
      if (data.policy && POLICY_LABELS[data.policy]) {
        this.policy = data.policy;
      } else {
        this.policy = "first";
      }

      // Validate pointer
      this.pointer = typeof data.pointer === "number" && data.pointer >= 0 && data.pointer < this.totalMemory
        ? data.pointer
        : 0;

      // Validate nextPid
      this.nextPid = typeof data.nextPid === "number" && data.nextPid >= 1
        ? data.nextPid
        : 1;

      // Counters and logs
      this.elapsedSeconds = typeof data.elapsedSeconds === "number" ? data.elapsedSeconds : 0;
      this.logCounter = typeof data.logCounter === "number" ? data.logCounter : 0;
      this.logEntries = Array.isArray(data.logEntries) ? data.logEntries.slice(0, 100) : [];

      // Validate comparisonSimulators
      if (Array.isArray(data.comparisonSimulators) && data.comparisonSimulators.length === 4) {
        this.comparisonSimulators = data.comparisonSimulators.map(sim => {
          let validBlocks = Array.isArray(sim.blocks) && sim.blocks.length > 0
            ? sim.blocks.map(b => ({
                offset: Number(b.offset),
                size: Number(b.size),
                pid: b.pid !== null && b.pid !== undefined ? Number(b.pid) : null
              }))
            : [{ offset: 0, size: this.totalMemory, pid: null }];
          return {
            id: sim.id,
            label: sim.id === "first" ? "First Fit" : sim.id === "best" ? "Best Fit" : sim.id === "worst" ? "Worst Fit" : "Next Fit",
            policy: sim.policy || sim.id,
            blocks: validBlocks,
            pointer: typeof sim.pointer === "number" ? sim.pointer : 0,
            successfulCount: typeof sim.successfulCount === "number" ? sim.successfulCount : 0,
            failedCount: typeof sim.failedCount === "number" ? sim.failedCount : 0,
            lastAction: sim.lastAction || null,
            recentlyAllocatedPid: sim.recentlyAllocatedPid || null
          };
        });
      } else {
        this.initComparisonSimulators();
        for (const sim of this.comparisonSimulators) {
          sim.blocks = this.blocks.map(b => ({ ...b }));
          sim.pointer = this.pointer;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  hasSavedState() {
    if (typeof localStorage !== "undefined") {
      try { if (localStorage.getItem(this.storageKey) !== null) return true; } catch {}
    }
    if (typeof sessionStorage !== "undefined") {
      try { if (sessionStorage.getItem(this.storageKey) !== null) return true; } catch {}
    }
    return false;
  }

  clearStoredState() {
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(this.storageKey); } catch {}
    }
    if (typeof sessionStorage !== "undefined") {
      try { sessionStorage.removeItem(this.storageKey); } catch {}
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.saveState();
    for (const listener of this.listeners) listener();
  }

  reset(mode = "clean", shouldNotify = true) {
    if (mode === "example") {
      this.resetToExample(shouldNotify);
    } else {
      this.resetTo1024(shouldNotify);
    }
  }

  resetSimulator(shouldNotify = true) {
    return this.resetTo1024(shouldNotify);
  }

  resetTo1024(shouldNotify = true) {
    const total = this.totalMemory || TOTAL_MEMORY;
    this.blocks = [{ offset: 0, size: total, pid: null }];
    this.queue = [];
    this.pointer = 0;
    this.nextPid = 1;
    this.elapsedSeconds = 0;
    this.logCounter = 0;
    this.logEntries = [];
    if (this.comparisonSimulators) {
      for (const sim of this.comparisonSimulators) {
        sim.blocks = [{ offset: 0, size: total, pid: null }];
        sim.pointer = 0;
        sim.successfulCount = 0;
        sim.failedCount = 0;
        sim.lastAction = null;
        sim.recentlyAllocatedPid = null;
      }
    }
    this.addLog("SYSTEM", "Memory arena reset", `Clean ${total.toLocaleString()} MB contiguous free space initialized; queue emptied.`);
    this.saveState();
    if (shouldNotify) this.notify();
  }

  resetToExample(shouldNotify = true) {
    this.blocks = INITIAL_BLOCKS.map(block => ({ ...block }));
    this.queue = INITIAL_QUEUE.map(process => ({ ...process }));
    this.pointer = 960;
    this.nextPid = 9;
    this.elapsedSeconds = 6;
    this.logCounter = 0;
    this.logEntries = [];
    if (this.comparisonSimulators) {
      for (const sim of this.comparisonSimulators) {
        sim.blocks = INITIAL_BLOCKS.map(block => ({ ...block }));
        sim.pointer = 960;
        sim.successfulCount = 0;
        sim.failedCount = 0;
        sim.lastAction = null;
        sim.recentlyAllocatedPid = null;
      }
    }
    this.addLog("SYSTEM", "Example loaded", "Memory layout matches the project specification.");
    this.saveState();
    if (shouldNotify) this.notify();
  }

  setPolicy(policy, shouldNotify = true) {
    if (!POLICY_LABELS[policy]) return;
    const changed = this.policy !== policy;
    this.policy = policy;
    if (this.comparisonSimulators) {
      const activeSim = this.comparisonSimulators.find(s => s.id === policy);
      if (activeSim && activeSim.blocks && activeSim.blocks.length > 0) {
        this.blocks = activeSim.blocks.map(b => ({ ...b }));
        this.pointer = activeSim.pointer || 0;
      }
    }
    if (changed) {
      this.addLog("POLICY", "Allocation policy changed", `Active strategy: ${POLICY_LABELS[policy]}.`);
    }
    if (shouldNotify) this.notify();
  }

  getStats() {
    const total = this.totalMemory || TOTAL_MEMORY;
    const allocated = this.blocks.filter(b => b.pid !== null);
    const available = this.blocks.filter(b => b.pid === null);
    const allocatedMemory = allocated.reduce((sum, b) => sum + b.size, 0);
    const freeMemory = total - allocatedMemory;
    const largestFree = available.reduce((max, b) => Math.max(max, b.size), 0);
    const frag = calculateFragmentation(this.blocks);
    const queueDemand = this.queue.reduce((sum, p) => sum + p.size, 0);

    return {
      totalMemory: total,
      allocatedMemory,
      allocatedCount: allocated.length,
      freeMemory,
      freeCount: available.length,
      largestFree,
      externalFragmentation: frag.externalFragmentation,
      fragmentationRate: frag.fragmentationRate,
      queueCount: this.queue.length,
      queueDemand,
      headProcess: this.queue[0] || null,
      pointer: this.pointer,
      policy: this.policy
    };
  }

  addLog(kind, title, detail, meta = {}) {
    this.elapsedSeconds += 1;
    this.logCounter += 1;
    this.logEntries.unshift({
      id: this.logCounter,
      kind,
      title,
      detail,
      time: this.elapsedSeconds,
      timestamp: new Date().toLocaleTimeString(),
      ...meta
    });
    this.logEntries = this.logEntries.slice(0, 100);
    this.saveState();
  }

  allocateNext(policy = this.policy) {
    if (policy && policy !== this.policy && POLICY_LABELS[policy]) {
      this.policy = policy;
    }
    const currentPolicy = this.policy;
    const process = this.queue[0];
    if (!process) return { success: false, reason: "empty" };

    const activeSim = this.comparisonSimulators
      ? this.comparisonSimulators.find(s => s.id === currentPolicy)
      : null;
    const targetBlocks = activeSim && activeSim.blocks && activeSim.blocks.length > 0
      ? activeSim.blocks
      : this.blocks;
    const targetPointer = activeSim ? activeSim.pointer : this.pointer;

    const placement = findAllocation(targetBlocks, process.size, currentPolicy, targetPointer);
    if (!placement) {
      this.addLog(
        "BLOCKED",
        `Process ${process.pid} does not fit`,
        `${process.size} MB requested; no free block is large enough under ${POLICY_LABELS[currentPolicy]}.`,
        { processId: process.pid, size: process.size, policy: currentPolicy }
      );
      this.notify();
      return { success: false, reason: "no-fit", process, policy: currentPolicy };
    }

    this.queue.shift();

    // Simultaneously evaluate and allocate across comparison simulators
    this.allocateOnSimulators(process);

    // Keep active simulator in sync with this.blocks
    if (activeSim) {
      this.blocks = activeSim.blocks.map(b => ({ ...b }));
      this.pointer = activeSim.pointer;
    }

    this.addLog(
      "ALLOCATED",
      `Process ${process.pid} placed`,
      `${process.size} MB at offset ${placement.offset} using ${POLICY_LABELS[currentPolicy]}.`,
      { processId: process.pid, size: process.size, offset: placement.offset, policy: currentPolicy }
    );
    this.notify();
    return { success: true, process, offset: placement.offset, policy: currentPolicy };
  }

  allocateOnSimulators(process) {
    if (!this.comparisonSimulators) return [];
    const resultsSummary = [];

    for (const sim of this.comparisonSimulators) {
      const candidateBlocks = sim.blocks.filter(b => b.pid === null && b.size >= process.size);
      const pointerBefore = typeof sim.pointer === "number" && !isNaN(sim.pointer) ? sim.pointer : 0;
      const placement = findAllocation(sim.blocks, process.size, sim.policy, pointerBefore);

      if (!placement) {
        const frag = calculateFragmentation(sim.blocks);
        sim.failedCount++;
        sim.lastAction = {
          success: false,
          pid: process.pid,
          size: process.size,
          reason: "No block large enough",
          rationale: `Rejected: no contiguous free block was ≥ ${process.size} MB (largest free block: ${frag.largestFree} MB, total free: ${frag.totalFree} MB). External fragmentation prevented placement.`
        };
        sim.recentlyAllocatedPid = null;
        resultsSummary.push(`${sim.label}: Failed`);
      } else {
        const leftover = placement.block.size - process.size;
        placeAllocation(sim.blocks, placement, process);
        let pointerAfter = sim.pointer;
        const totalMem = this.totalMemory || TOTAL_MEMORY;
        if (sim.policy === "next") {
          sim.pointer = (placement.offset + process.size) % totalMem;
          pointerAfter = sim.pointer;
        }

        let rationale = "";
        if (candidateBlocks.length === 1) {
          rationale = `Selected Block @ ${placement.block.offset} MB (${placement.block.size} MB hole) leaving ${leftover} MB remainder. Note: Only 1 suitable contiguous free block was large enough in memory.`;
        } else if (sim.policy === "first") {
          rationale = `Scanned sequentially from address 0 MB and selected the first available hole large enough (Block @ ${placement.block.offset} MB, ${placement.block.size} MB hole), leaving a ${leftover} MB remainder.`;
        } else if (sim.policy === "best") {
          rationale = `Evaluated all ${candidateBlocks.length} candidate free holes and selected the closest fit (Block @ ${placement.block.offset} MB, ${placement.block.size} MB hole) to minimize wasted space; leftover hole is ${leftover} MB.`;
        } else if (sim.policy === "worst") {
          rationale = `Evaluated all ${candidateBlocks.length} candidate free holes and selected the largest hole in memory (Block @ ${placement.block.offset} MB, ${placement.block.size} MB hole) leaving the largest remainder of ${leftover} MB.`;
        } else if (sim.policy === "next") {
          rationale = `Scanned forward starting from search pointer at ${pointerBefore} MB and selected the next available hole (Block @ ${placement.block.offset} MB, ${placement.block.size} MB hole). Search pointer advanced to ${pointerAfter} MB.`;
        }

        sim.successfulCount++;
        sim.lastAction = {
          success: true,
          pid: process.pid,
          size: process.size,
          offset: placement.offset,
          blockOffset: placement.block.offset,
          blockSize: placement.block.size,
          leftover,
          pointerBefore,
          pointerAfter,
          candidateCount: candidateBlocks.length,
          rationale
        };
        sim.recentlyAllocatedPid = process.pid;
        resultsSummary.push(`${sim.label}: Offset ${placement.offset}M`);
      }
    }
    return resultsSummary;
  }

  stepSharedAllocation() {
    const process = this.queue[0];
    if (!process) return { success: false, reason: "empty" };
    this.queue.shift();

    const resultsSummary = this.allocateOnSimulators(process);

    // Keep active policy in sync with the corresponding simulator
    const activeSim = this.comparisonSimulators
      ? this.comparisonSimulators.find(s => s.id === this.policy)
      : null;
    if (activeSim && activeSim.lastAction && activeSim.lastAction.success) {
      this.blocks = activeSim.blocks.map(b => ({ ...b }));
      this.pointer = activeSim.pointer;
    } else {
      const mainPlacement = findAllocation(this.blocks, process.size, this.policy, this.pointer);
      if (mainPlacement) {
        placeAllocation(this.blocks, mainPlacement, process);
        const totalMem = this.totalMemory || TOTAL_MEMORY;
        if (this.policy === "next") {
          this.pointer = (mainPlacement.offset + process.size) % totalMem;
        }
      }
    }

    this.addLog(
      "ALLOCATED",
      `Process P${process.pid} (${process.size} MB) evaluated across 4 algorithms`,
      resultsSummary.join(" · "),
      { processId: process.pid, size: process.size, comparison: true }
    );
    this.notify();
    return { success: true, process, resultsSummary };
  }

  release(pid) {
    let freedSize = 0;
    let freedOffset = 0;
    const block = this.blocks.find(item => item.pid === pid);
    if (block) {
      freedSize = block.size;
      freedOffset = block.offset;
      block.pid = null;

      const countBefore = this.blocks.length;
      this.blocks = mergeFreeBlocks(this.blocks);
      const countAfter = this.blocks.length;

      this.addLog(
        "RELEASED",
        `Process ${pid} freed`,
        `Released ${freedSize} MB at offset ${freedOffset}. Memory marked free.`,
        { processId: pid, size: freedSize, offset: freedOffset }
      );

      if (countBefore > countAfter) {
        const mergedBlock = this.blocks.find(b => b.pid === null && b.offset <= freedOffset && (b.offset + b.size) >= (freedOffset + freedSize));
        const mergedSize = mergedBlock ? mergedBlock.size : "adjacent";
        this.addLog(
          "MERGED",
          "Free blocks coalesced",
          `Adjacent free segments merged into a contiguous ${mergedSize} MB free region.`,
          { processId: pid, newSize: mergedSize }
        );
      }
    }

    // Release across all four comparison simulators
    let releasedInSims = 0;
    if (this.comparisonSimulators) {
      for (const sim of this.comparisonSimulators) {
        let foundInSim = false;
        for (const b of sim.blocks) {
          if (b.pid === pid) {
            b.pid = null;
            foundInSim = true;
          }
        }
        if (foundInSim) {
          sim.blocks = mergeFreeBlocks(sim.blocks);
          releasedInSims++;
        }
      }
      const activeSim = this.comparisonSimulators.find(s => s.id === this.policy);
      if (activeSim && releasedInSims > 0) {
        this.blocks = activeSim.blocks.map(b => ({ ...b }));
      }
    }

    if (!block && releasedInSims === 0) return false;

    if (!block && releasedInSims > 0) {
      this.addLog(
        "RELEASED",
        `Process P${pid} released`,
        `Deallocated from ${releasedInSims} simulators and adjacent free blocks coalesced.`,
        { processId: pid, comparison: true }
      );
    }

    this.notify();
    return true;
  }

  completeProcess(pid) {
    return this.release(pid);
  }

  compact() {
    const freeBlocksBefore = this.blocks.filter(b => b.pid === null);
    if (freeBlocksBefore.length <= 1) {
      return {
        success: false,
        reason: "already-compact",
        message: "Memory arena is already compact. There are no separate free fragments to coalesce."
      };
    }

    const beforeBlocks = this.blocks.map(b => ({ ...b }));
    const result = compactMemory(this.blocks, this.totalMemory || TOTAL_MEMORY);
    this.blocks = result.blocks;
    this.pointer = result.totalAllocated;

    // Keep active comparison simulator in sync
    if (this.comparisonSimulators) {
      const activeSim = this.comparisonSimulators.find(s => s.id === this.policy);
      if (activeSim) {
        activeSim.blocks = result.blocks.map(b => ({ ...b }));
        activeSim.pointer = result.totalAllocated;
      }
    }

    const movedCount = result.relocations.filter(r => r.moved).length;
    this.addLog(
      "COMPACTED",
      "Memory arena compacted",
      `Consolidated ${result.freeBlockCountBefore} free fragments into a single contiguous ${result.totalFree} MB region at offset ${result.totalAllocated} MB. Relocated ${movedCount} processes.`,
      {
        totalFree: result.totalFree,
        freeBlocksBefore: result.freeBlockCountBefore,
        relocatedCount: movedCount
      }
    );

    this.notify();
    return {
      success: true,
      beforeBlocks,
      afterBlocks: this.blocks.map(b => ({ ...b })),
      relocations: result.relocations,
      totalFree: result.totalFree,
      largestFreeBefore: result.largestFreeBefore,
      freeBlocksBefore: result.freeBlockCountBefore
    };
  }

  enqueueProcess(size, pid = null, priority = 2) {
    const maxMem = this.totalMemory || TOTAL_MEMORY;
    if (!Number.isInteger(size) || size < 1 || size > maxMem) return null;

    let targetPid;
    if (pid !== null) {
      if (!Number.isInteger(pid) || pid < 1) return null;
      const existsInBlocks = this.blocks.some(b => b.pid === pid);
      const existsInQueue = this.queue.some(p => p.pid === pid);
      const existsInSims = this.comparisonSimulators && this.comparisonSimulators.some(sim => sim.blocks.some(b => b.pid === pid));
      if (existsInBlocks || existsInQueue || existsInSims) return null;
      targetPid = pid;
      this.nextPid = Math.max(this.nextPid, pid + 1);
    } else {
      while (
        this.blocks.some(b => b.pid === this.nextPid) ||
        this.queue.some(p => p.pid === this.nextPid) ||
        (this.comparisonSimulators && this.comparisonSimulators.some(sim => sim.blocks.some(b => b.pid === this.nextPid)))
      ) {
        this.nextPid++;
      }
      targetPid = this.nextPid++;
    }

    const validPriority = Number.isInteger(priority) && priority >= 1 && priority <= 5 ? priority : 2;
    const process = { pid: targetPid, size, priority: validPriority, cpu: 1 };
    this.queue.push(process);
    this.addLog(
      "QUEUED",
      `Process ${process.pid} added`,
      `${size} MB request (Priority ${validPriority}) is waiting for allocation.`,
      { processId: process.pid, size, priority: validPriority }
    );
    this.notify();
    return process;
  }

  removeProcess(pid) {
    const index = this.queue.findIndex(item => item.pid === pid);
    if (index === -1) return false;
    const [removed] = this.queue.splice(index, 1);
    this.addLog(
      "SYSTEM",
      `Process ${removed.pid} removed`,
      `${removed.size} MB request removed from waiting queue.`,
      { processId: removed.pid, size: removed.size }
    );
    this.notify();
    return true;
  }

  getFragmentationStats() {
    return calculateFragmentation(this.blocks);
  }

  logPolicyChange(policy) {
    this.setPolicy(policy);
  }

  clearLog() {
    this.logEntries = [];
    this.notify();
  }

  setupCustomWorkload({ totalMemory, blockSizes, processSizes, runImmediately = false }) {
    let total = Number(totalMemory);
    if (!Number.isInteger(total) || total <= 0) {
      throw new Error("Total memory must be a positive integer.");
    }

    if (!Array.isArray(blockSizes) || blockSizes.length === 0) {
      throw new Error("Provide at least one initial memory block size.");
    }

    for (const s of blockSizes) {
      if (!Number.isInteger(s) || s <= 0) {
        throw new Error(`Block size "${s}" is invalid. Each block size must be a positive integer.`);
      }
    }

    const sumBlocks = blockSizes.reduce((a, b) => a + b, 0);
    if (sumBlocks > total) {
      total = sumBlocks;
    }

    let currentOffset = 0;
    const initialBlocks = [];
    for (const size of blockSizes) {
      initialBlocks.push({
        offset: currentOffset,
        size,
        pid: null
      });
      currentOffset += size;
    }
    if (currentOffset < total) {
      initialBlocks.push({
        offset: currentOffset,
        size: total - currentOffset,
        pid: null
      });
    }

    const queue = [];
    let pidCounter = 1;
    if (Array.isArray(processSizes)) {
      for (const s of processSizes) {
        if (!Number.isInteger(s) || s <= 0) {
          throw new Error(`Process size "${s}" is invalid. Each process size must be a positive integer.`);
        }
        queue.push({
          pid: pidCounter++,
          size: s,
          priority: 2,
          cpu: 1
        });
      }
    }

    this.totalMemory = total;
    this.blocks = initialBlocks.map(b => ({ ...b }));
    this.queue = queue.map(p => ({ ...p }));
    this.pointer = 0;
    this.nextPid = pidCounter;
    this.lastEvaluatedProcesses = queue.map(p => ({ ...p }));

    this.comparisonSimulators = [
      { id: "first", label: "First Fit", policy: "first", blocks: initialBlocks.map(b => ({ ...b })), pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "best", label: "Best Fit", policy: "best", blocks: initialBlocks.map(b => ({ ...b })), pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "worst", label: "Worst Fit", policy: "worst", blocks: initialBlocks.map(b => ({ ...b })), pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null },
      { id: "next", label: "Next Fit", policy: "next", blocks: initialBlocks.map(b => ({ ...b })), pointer: 0, successfulCount: 0, failedCount: 0, lastAction: null, recentlyAllocatedPid: null }
    ];

    this.addLog(
      "SYSTEM",
      "Custom workload configured",
      `Total memory: ${total} MB, ${initialBlocks.length} free block(s), ${queue.length} process(es) queued.`
    );

    if (runImmediately) {
      while (this.queue.length > 0) {
        const proc = this.queue.shift();
        this.allocateOnSimulators(proc);
      }
      const activeSim = this.comparisonSimulators.find(s => s.id === this.policy);
      if (activeSim) {
        this.blocks = activeSim.blocks.map(b => ({ ...b }));
        this.pointer = activeSim.pointer;
      }
    }

    this.saveState();
    this.notify();

    return {
      totalMemory: total,
      blocks: initialBlocks,
      queue,
      simulators: this.comparisonSimulators
    };
  }
}
