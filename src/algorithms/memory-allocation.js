export const TOTAL_MEMORY = 1024;
export const POLICY_LABELS = Object.freeze({
  first: "First Fit",
  next: "Next Fit",
  best: "Best Fit",
  worst: "Worst Fit"
});

export function findAllocation(blocks, size, policy, pointer = 0) {
  if (typeof size !== "number" || isNaN(size) || size <= 0) return null;
  const safePointer = typeof pointer === "number" && !isNaN(pointer) ? pointer : 0;
  const candidates = blocks
    .filter(block => block.pid === null && block.size >= size)
    .sort((a, b) => a.offset - b.offset);
  if (!candidates.length) return null;

  if (policy === "best") {
    const block = candidates.reduce((best, item) => item.size < best.size ? item : best);
    return { block, offset: block.offset };
  }
  if (policy === "worst") {
    const block = candidates.reduce((worst, item) => item.size > worst.size ? item : worst);
    return { block, offset: block.offset };
  }
  if (policy === "next") {
    // 1. Search forward from current pointer
    for (const block of candidates) {
      const offset = Math.max(block.offset, safePointer);
      if (block.offset + block.size - offset >= size) return { block, offset };
    }
    // 2. Wrap-around to the beginning of memory and search up to pointer
    for (const block of candidates) {
      if (block.offset < safePointer && block.size >= size) {
        return { block, offset: block.offset };
      }
    }
    // 3. Fallback: If a candidate block exists, guarantee allocation so a valid hole is never missed
    if (candidates.length > 0) {
      return { block: candidates[0], offset: candidates[0].offset };
    }
    return null;
  }

  const block = candidates[0];
  return { block, offset: block.offset };
}

export function placeAllocation(blocks, placement, process) {
  const { block, offset } = placement;
  const replacement = [];
  const prefix = offset - block.offset;
  const suffix = block.offset + block.size - (offset + process.size);
  if (prefix > 0) replacement.push({ offset: block.offset, size: prefix, pid: null });
  replacement.push({ offset, size: process.size, pid: process.pid });
  if (suffix > 0) replacement.push({ offset: offset + process.size, size: suffix, pid: null });
  const idx = blocks.indexOf(block);
  if (idx !== -1) {
    blocks.splice(idx, 1, ...replacement);
  } else {
    const fallbackIdx = blocks.findIndex(b => b.offset === block.offset && b.size === block.size && b.pid === null);
    if (fallbackIdx !== -1) {
      blocks.splice(fallbackIdx, 1, ...replacement);
    }
  }
}

export function mergeFreeBlocks(blocks) {
  const merged = [];
  for (const block of [...blocks].sort((a, b) => a.offset - b.offset)) {
    const previous = merged[merged.length - 1];
    if (previous && previous.pid === null && block.pid === null) {
      previous.size += block.size;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

export function calculateFragmentation(blocks) {
  const freeBlocks = blocks.filter(b => b.pid === null);
  const totalFree = freeBlocks.reduce((sum, b) => sum + b.size, 0);
  const largestFree = freeBlocks.reduce((max, b) => Math.max(max, b.size), 0);
  const externalFragmentation = freeBlocks.length > 1 ? totalFree - largestFree : 0;
  const fragmentationRate = totalFree > 0 ? (externalFragmentation / totalFree) * 100 : 0;

  return {
    totalFree,
    largestFree,
    freeBlockCount: freeBlocks.length,
    externalFragmentation,
    fragmentationRate: Number(fragmentationRate.toFixed(1))
  };
}

export function compactMemory(blocks, totalMemory = TOTAL_MEMORY) {
  const sorted = [...blocks].sort((a, b) => a.offset - b.offset);
  const allocated = sorted.filter(b => b.pid !== null);
  const freeBlocksBefore = sorted.filter(b => b.pid === null);
  const totalAllocated = allocated.reduce((sum, b) => sum + b.size, 0);
  const totalFree = (totalMemory || TOTAL_MEMORY) - totalAllocated;
  const largestFreeBefore = freeBlocksBefore.reduce((max, b) => Math.max(max, b.size), 0);

  let currentOffset = 0;
  const compactedBlocks = [];
  const relocations = [];

  for (const block of allocated) {
    const newOffset = currentOffset;
    relocations.push({
      pid: block.pid,
      size: block.size,
      oldOffset: block.offset,
      newOffset,
      moved: block.offset !== newOffset
    });
    compactedBlocks.push({
      offset: newOffset,
      size: block.size,
      pid: block.pid
    });
    currentOffset += block.size;
  }

  if (totalFree > 0) {
    compactedBlocks.push({
      offset: totalAllocated,
      size: totalFree,
      pid: null
    });
  }

  return {
    blocks: compactedBlocks,
    relocations,
    totalAllocated,
    totalFree,
    freeBlockCountBefore: freeBlocksBefore.length,
    largestFreeBefore
  };
}

export function simulatePolicy(initialBlocks, queue, initialPointer, policy, totalMemory = TOTAL_MEMORY) {
  const simulatedBlocks = initialBlocks.map(b => ({ ...b }));
  let simulatedPointer = initialPointer;
  const placements = [];
  const unplaced = [];
  const effectiveTotal = totalMemory || TOTAL_MEMORY;

  for (const process of queue) {
    const placement = findAllocation(simulatedBlocks, process.size, policy, simulatedPointer);
    if (!placement) {
      unplaced.push({ ...process, reason: "No free block of sufficient size" });
      continue;
    }

    placeAllocation(simulatedBlocks, placement, process);
    if (policy === "next") {
      simulatedPointer = (placement.offset + process.size) % effectiveTotal;
    }

    placements.push({
      pid: process.pid,
      size: process.size,
      offset: placement.offset,
      sourceBlockOffset: placement.block.offset,
      sourceBlockSize: placement.block.size,
      success: true
    });
  }

  const frag = calculateFragmentation(simulatedBlocks);

  return {
    policy,
    label: POLICY_LABELS[policy] || policy,
    placements,
    unplaced,
    allocationsCompleted: placements.length,
    remainingFree: frag.totalFree,
    largestFree: frag.largestFree,
    externalFragmentation: frag.externalFragmentation,
    fragmentationRate: frag.fragmentationRate,
    simulatedBlocks,
    finalPointer: simulatedPointer
  };
}
