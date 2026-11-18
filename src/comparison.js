import { findAllocation, placeAllocation, mergeFreeBlocks, calculateFragmentation, POLICY_LABELS, TOTAL_MEMORY } from "./algorithms/memory-allocation.js";
import { showToast } from "./utils/feedback.js";

// Preset 0: Demonstration Scenario with Multiple Fragmented Free Blocks (4-Way Divergence)
// Free blocks: 50 MB, 220 MB, 170 MB, 190 MB, 250 MB
// When P5 (150 MB) arrives with pointer at 520:
// - First Fit picks 220 MB hole @ 80 MB (first fit)
// - Best Fit picks 170 MB hole @ 340 MB (closest fit, min leftover 20 MB)
// - Next Fit picks 190 MB hole @ 550 MB (next after pointer 520)
// - Worst Fit picks 250 MB hole @ 774 MB (largest hole in memory)
const DEMONSTRATION_FRAGMENTED_PRESET = {
  id: "demo",
  name: "★ Demonstration Scenario (5 Fragmented Free Blocks, 4 Occupied)",
  blocks: [
    { offset: 0, size: 50, pid: null },          // Free 1: 50 MB (too small for 150 MB)
    { offset: 50, size: 30, pid: 1 },           // P1: 30 MB
    { offset: 80, size: 220, pid: null },        // Free 2: 220 MB -> First Fit selects (offset 80)
    { offset: 300, size: 40, pid: 2 },          // P2: 40 MB
    { offset: 340, size: 170, pid: null },       // Free 3: 170 MB -> Best Fit selects (offset 340)
    { offset: 510, size: 40, pid: 3 },          // P3: 40 MB
    { offset: 550, size: 190, pid: null },       // Free 4: 190 MB -> Next Fit selects (offset 550)
    { offset: 740, size: 34, pid: 4 },          // P4: 34 MB
    { offset: 774, size: 250, pid: null }        // Free 5: 250 MB -> Worst Fit selects (offset 774)
  ],
  queue: [
    { pid: 5, size: 150, priority: 1, cpu: 1 },
    { pid: 6, size: 180, priority: 2, cpu: 1 },
    { pid: 7, size: 60, priority: 3, cpu: 1 }
  ],
  pointer: 520
};

// Preset A: Benchmark Suite with Non-Contiguous Free Blocks (300 MB / 500 MB / 200 MB)
// Specifically models Section 5: non-contiguous free memory blocks separated by allocated processes.
// Request: P3 (180 MB)
// - First Fit: selects 300 MB block @ offset 0
// - Best Fit: selects 200 MB block @ offset 824
// - Worst Fit: selects 500 MB block @ offset 312
// - Next Fit: selects 500 MB block @ offset 312 (pointer at 312)
const TEST_BENCHMARK_PRESET = {
  id: "benchmark",
  name: "Benchmark Suite (300 / 500 / 200 MB Free separated by processes)",
  blocks: [
    { offset: 0, size: 300, pid: null },          // Free Hole 1: 300 MB -> First Fit selects (offset 0)
    { offset: 300, size: 12, pid: 1 },           // Allocated Process P1: 12 MB
    { offset: 312, size: 500, pid: null },        // Free Hole 2: 500 MB -> Worst Fit & Next Fit select (offset 312)
    { offset: 812, size: 12, pid: 2 },           // Allocated Process P2: 12 MB
    { offset: 824, size: 200, pid: null }         // Free Hole 3: 200 MB -> Best Fit selects (offset 824)
  ],
  queue: [
    { pid: 3, size: 180, priority: 2, cpu: 1 }
  ],
  pointer: 312
};

// Preset B: Standard Project Specification (7 Blocks, 3 Queued)
const STANDARD_SPEC_PRESET = {
  id: "standard",
  name: "Standard Specification Preset (7 Blocks, 3 Queued)",
  blocks: [
    { offset: 0, size: 192, pid: null },
    { offset: 192, size: 32, pid: 1 },
    { offset: 224, size: 416, pid: null },
    { offset: 640, size: 32, pid: 3 },
    { offset: 672, size: 160, pid: null },
    { offset: 832, size: 128, pid: 5 },
    { offset: 960, size: 64, pid: null }
  ],
  queue: [
    { pid: 6, size: 108, priority: 2, cpu: 1 },
    { pid: 7, size: 256, priority: 2, cpu: 1 },
    { pid: 8, size: 80, priority: 2, cpu: 1 }
  ],
  pointer: 960
};

// Preset C: Clean 1,024 MB Free Arena
const CLEAN_1024_PRESET = {
  id: "clean",
  name: "Clean 1,024 MB Free Arena (Single Unfragmented Block)",
  blocks: [
    { offset: 0, size: 1024, pid: null }
  ],
  queue: [],
  pointer: 0
};

export function initializeComparison(manager) {
  const elements = {
    scenarioName: document.querySelector("#comp-active-scenario-name"),
    presetDemoBtn: document.querySelector("#comp-preset-demo-btn"),
    presetTestBtn: document.querySelector("#comp-preset-test-btn"),
    presetBaselineBtn: document.querySelector("#comp-preset-baseline-btn"),
    presetLiveBtn: document.querySelector("#comp-preset-live-btn"),
    presetCleanBtn: document.querySelector("#comp-preset-clean-btn"),
    stepBtn: document.querySelector("#comp-step-btn"),
    runBtn: document.querySelector("#comp-run-btn"),
    addProcBtn: document.querySelector("#comp-add-proc-btn"),
    releaseProcBtn: document.querySelector("#comp-release-proc-btn"),
    resetBtn: document.querySelector("#comp-reset-btn"),
    addForm: document.querySelector("#comp-add-proc-form"),
    sizeInput: document.querySelector("#comp-proc-size"),
    pidInput: document.querySelector("#comp-proc-pid"),
    priorityInput: document.querySelector("#comp-proc-priority"),
    cancelAddBtn: document.querySelector("#comp-cancel-add-btn"),
    releasePanel: document.querySelector("#comp-release-panel"),
    releaseSelect: document.querySelector("#comp-release-select"),
    confirmReleaseBtn: document.querySelector("#comp-confirm-release-btn"),
    cancelReleaseBtn: document.querySelector("#comp-cancel-release-btn"),
    queueCount: document.querySelector("#comp-queue-count"),
    queueChips: document.querySelector("#comp-queue-chips"),
    simulatorsGrid: document.querySelector("#simulators-grid"),
    summaryPanel: document.querySelector("#comp-summary-panel"),
    summaryContent: document.querySelector("#comp-summary-content"),
    divergenceChip: document.querySelector("#comp-divergence-chip"),
    matrixBody: document.querySelector("#comparison-matrix-body"),
    banner: document.querySelector("#comparison-feedback-banner"),
    bannerIcon: document.querySelector("#comp-feedback-icon"),
    bannerText: document.querySelector("#comp-feedback-text")
  };

  let activeMode = "live"; // "demo" | "clean" | "live" | "standard" | "benchmark"
  let activePreset = {
    id: "live",
    name: `Live Synchronized State (${manager.blocks.length} Blocks, ${manager.queue.length} Queued)`,
    blocks: manager.blocks.map(b => ({ ...b })),
    queue: manager.queue.map(p => ({ ...p })),
    pointer: manager.pointer
  };
  let comparisonQueue = manager.queue;
  let nextPid = 1;
  let runInterval = null;

  // Four genuinely independent simulators referencing manager's comparison state dynamically
  function getSimulators() {
    if (!manager.comparisonSimulators || manager.comparisonSimulators.length !== 4) {
      manager.initComparisonSimulators();
    }
    return manager.comparisonSimulators;
  }

  function showBanner(type, message) {
    if (!elements.banner) return;
    elements.banner.classList.remove("hidden", "feedback-success", "feedback-failure", "feedback-info");
    elements.banner.classList.add(`feedback-${type}`);
    if (elements.bannerIcon) {
      elements.bannerIcon.textContent = type === "success" ? "✓" : type === "failure" ? "✕" : "ℹ";
    }
    if (elements.bannerText) {
      elements.bannerText.textContent = message;
    }
  }

  function getNextAvailablePid() {
    let max = Math.max(1, manager.nextPid || 1);
    for (const p of manager.queue) {
      if (p.pid >= max) max = p.pid + 1;
    }
    for (const b of manager.blocks) {
      if (b.pid !== null && b.pid >= max) max = b.pid + 1;
    }
    for (const sim of getSimulators()) {
      for (const b of sim.blocks) {
        if (b.pid !== null && b.pid >= max) max = b.pid + 1;
      }
    }
    nextPid = max + 1;
    return max;
  }

  function updatePresetButtons(mode) {
    if (elements.presetDemoBtn) {
      elements.presetDemoBtn.classList.toggle("button-primary", mode === "demo");
      elements.presetDemoBtn.classList.toggle("button-outline", mode !== "demo");
    }
    if (elements.presetTestBtn) {
      elements.presetTestBtn.classList.toggle("button-primary", mode === "benchmark");
      elements.presetTestBtn.classList.toggle("button-outline", mode !== "benchmark");
    }
    if (elements.presetBaselineBtn) {
      elements.presetBaselineBtn.classList.toggle("button-primary", mode === "standard");
      elements.presetBaselineBtn.classList.toggle("button-outline", mode !== "standard");
    }
    if (elements.presetLiveBtn) {
      elements.presetLiveBtn.classList.toggle("button-primary", mode === "live");
      elements.presetLiveBtn.classList.toggle("button-outline", mode !== "live");
    }
    if (elements.presetCleanBtn) {
      elements.presetCleanBtn.classList.toggle("button-primary", mode === "clean");
      elements.presetCleanBtn.classList.toggle("button-outline", mode !== "clean");
    }
  }

  function loadPreset(preset, mode = "preset") {
    stopRun();
    activeMode = mode;
    activePreset = preset;

    if (elements.scenarioName) {
      elements.scenarioName.textContent = preset.name;
    }
    updatePresetButtons(mode);

    // Initialize all four simulators with independent cloned blocks and state
    for (const sim of getSimulators()) {
      sim.blocks = preset.blocks.map(b => ({ ...b }));
      sim.pointer = preset.pointer || 0;
      sim.successfulCount = 0;
      sim.failedCount = 0;
      sim.lastAction = null;
      sim.recentlyAllocatedPid = null;
    }

    // Synchronize preset workload into manager
    manager.blocks = preset.blocks.map(b => ({ ...b }));
    manager.pointer = preset.pointer || 0;
    manager.queue = preset.queue.map(p => ({ ...p }));
    manager.nextPid = Math.max(1, ...manager.queue.map(p => p.pid + 1));
    manager.saveState();
    manager.notify();

    renderAll();
  }

  function loadLiveState(showToastNotice = false) {
    stopRun();
    activeMode = "live";
    const livePreset = {
      id: "live",
      name: `Live Synchronized State (${manager.blocks.length} Blocks, ${manager.queue.length} Queued)`,
      blocks: manager.blocks.map(b => ({ ...b })),
      queue: manager.queue.map(p => ({ ...p })),
      pointer: manager.pointer,
      totalMemory: manager.totalMemory || 1024
    };
    activePreset = livePreset;

    if (elements.scenarioName) {
      elements.scenarioName.textContent = livePreset.name;
    }
    updatePresetButtons("live");

    comparisonQueue = manager.queue;
    nextPid = Math.max(1, ...manager.queue.map(p => p.pid + 1));

    if (showToastNotice) {
      for (const sim of getSimulators()) {
        sim.blocks = manager.blocks.map(b => ({ ...b }));
        sim.pointer = manager.pointer;
        sim.successfulCount = 0;
        sim.failedCount = 0;
        sim.lastAction = null;
        sim.recentlyAllocatedPid = null;
      }
    }

    renderAll();
    if (showToastNotice) {
      showToast("Copied live Memory Simulator state and queue into all four algorithms.");
      showBanner("info", "All four comparison algorithms initialized with current live Memory Simulator layout and queue.");
    }
  }

  function renderQueueChips() {
    if (!elements.queueChips) return;
    elements.queueChips.replaceChildren();

    const currentQueue = manager.queue;

    if (currentQueue.length > 0) {
      if (elements.queueCount) {
        elements.queueCount.textContent = String(currentQueue.length);
      }
      currentQueue.forEach((process, index) => {
        const chip = document.createElement("div");
        chip.className = `comp-queue-chip ${index === 0 ? "chip-next" : ""}`;
        chip.innerHTML = `
          <span class="chip-badge">P${process.pid}</span>
          <strong>${process.size} MB</strong>
          <small>Priority ${process.priority}</small>
          <button class="chip-remove" type="button" aria-label="Remove process ${process.pid}">&times;</button>
        `;

        const removeBtn = chip.querySelector(".chip-remove");
        removeBtn.addEventListener("click", event => {
          event.stopPropagation();
          manager.removeProcess(process.pid);
          renderAll();
          showToast(`Process P${process.pid} removed from comparison queue.`);
        });

        elements.queueChips.append(chip);
      });
      return;
    }

    if (elements.queueCount) {
      elements.queueCount.textContent = "0";
    }

    const emptyNotice = document.createElement("div");
    emptyNotice.className = "comp-queue-empty";

    if (manager.lastEvaluatedProcesses && manager.lastEvaluatedProcesses.length > 0) {
      const procsList = manager.lastEvaluatedProcesses
        .map(p => `<span class="chip-evaluated">P${p.pid} (${p.size}M)</span>`)
        .join(" ");
      emptyNotice.innerHTML = `<span>✓</span> All workload requests evaluated across 4 algorithms: ${procsList}. See live placements and matrix below.`;
    } else {
      emptyNotice.innerHTML = `<span>✓</span> All pending processes allocated across simulators. Use <strong>+ Add Process</strong> to enqueue new requests.`;
    }
    elements.queueChips.append(emptyNotice);
  }

  function renderSimulatorCard(sim) {
    const card = document.createElement("div");
    card.className = `sim-card sim-card-${sim.id}`;

    const frag = calculateFragmentation(sim.blocks);
    const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
    const allocatedMemory = allocatedBlocks.reduce((sum, b) => sum + b.size, 0);

    // Header
    const header = document.createElement("div");
    header.className = "sim-header";
    const headerLeft = document.createElement("div");
    headerLeft.className = "sim-title-group";
    const tag = document.createElement("span");
    tag.className = `policy-pill ${sim.id}-pill`;
    tag.textContent = sim.label;
    headerLeft.append(tag);

    const headerRight = document.createElement("div");
    headerRight.className = "sim-header-right";

    if (sim.policy === "next") {
      const pointerBadge = document.createElement("span");
      pointerBadge.className = "sim-pointer-badge";
      pointerBadge.innerHTML = `POINTER: <strong>${sim.pointer} MB</strong>`;
      headerRight.append(pointerBadge);
    }

    const statusTag = document.createElement("span");
    if (!sim.lastAction) {
      statusTag.className = "sim-status-tag tag-ready";
      statusTag.textContent = "Ready";
    } else if (sim.lastAction.success) {
      statusTag.className = "sim-status-tag tag-success";
      statusTag.textContent = `P${sim.lastAction.pid} @ ${sim.lastAction.offset}M`;
    } else {
      statusTag.className = "sim-status-tag tag-failure";
      statusTag.textContent = `P${sim.lastAction.pid} Failed (No Fit)`;
    }
    headerRight.append(statusTag);
    header.append(headerLeft, headerRight);

    // Block Selection Notice
    const selectionBar = document.createElement("div");
    selectionBar.className = "sim-selection-bar";
    if (!sim.lastAction) {
      selectionBar.innerHTML = `<span class="selection-icon">ℹ</span> Awaiting process allocation...`;
    } else if (sim.lastAction.success) {
      selectionBar.innerHTML = `<span class="selection-icon success-icon">✓</span> Placed <strong>P${sim.lastAction.pid} (${sim.lastAction.size} MB)</strong> into block at <strong>offset ${sim.lastAction.blockOffset} MB</strong> (size ${sim.lastAction.blockSize} MB). Starting address: <strong>${sim.lastAction.offset} MB</strong>. Remaining in block: <strong>${sim.lastAction.leftover} MB</strong>.`;
    } else {
      selectionBar.innerHTML = `<span class="selection-icon failure-icon">✕</span> <strong>P${sim.lastAction.pid} (${sim.lastAction.size} MB)</strong> could not fit into any free block (largest free: ${frag.largestFree} MB).`;
    }

    // Graphical Memory Bar (Interactive Arena)
    const arenaWrap = document.createElement("div");
    arenaWrap.className = "sim-arena-wrap";

    const totalMem = manager.totalMemory || TOTAL_MEMORY;
    const q1 = Math.round(totalMem * 0.25);
    const q2 = Math.round(totalMem * 0.5);
    const q3 = Math.round(totalMem * 0.75);

    const ruler = document.createElement("div");
    ruler.className = "sim-arena-ruler";
    ruler.innerHTML = `<span>0 MB</span><span>${q1.toLocaleString()} MB</span><span>${q2.toLocaleString()} MB</span><span>${q3.toLocaleString()} MB</span><span>${totalMem.toLocaleString()} MB</span>`;

    const bar = document.createElement("div");
    bar.className = "sim-arena-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${sim.label} Memory Arena`);

    for (const b of sim.blocks) {
      const seg = document.createElement("div");
      const pct = (b.size / totalMem) * 100;
      seg.style.width = `${pct}%`;
      const isFree = b.pid === null;
      seg.className = `sim-seg ${isFree ? "sim-seg-free" : "sim-seg-allocated"}`;

      if (!isFree && b.pid === sim.recentlyAllocatedPid) {
        seg.classList.add("anim-just-allocated");
      }

      seg.title = isFree
        ? `Free: ${b.size} MB (offset ${b.offset} - ${b.offset + b.size} MB)`
        : `Process P${b.pid}: ${b.size} MB (offset ${b.offset} - ${b.offset + b.size} MB). Click to release.`;

      if (pct > 7.5) {
        seg.innerHTML = isFree ? `<span>${b.size}M</span>` : `<strong>P${b.pid}</strong><small>${b.size}M</small>`;
      } else if (pct > 3.5) {
        seg.innerHTML = isFree ? `<span>${b.size}</span>` : `<strong>P${b.pid}</strong>`;
      }

      if (!isFree) {
        seg.style.cursor = "pointer";
        seg.addEventListener("click", () => {
          releaseProcessAcrossAll(b.pid);
        });
      }

      bar.append(seg);
    }

    // Next-Fit pointer line
    if (sim.policy === "next") {
      const pointerDot = document.createElement("div");
      pointerDot.className = "sim-pointer-dot";
      pointerDot.style.left = `${(sim.pointer / totalMem) * 100}%`;
      pointerDot.title = `Next Fit Pointer: ${sim.pointer} MB`;
      bar.append(pointerDot);
    }

    arenaWrap.append(ruler, bar);

    // Independent Statistics Grid (6 Cards)
    const statsGrid = document.createElement("div");
    statsGrid.className = "sim-stats-grid";
    statsGrid.innerHTML = `
      <div class="sim-stat-box">
        <small>ALLOCATED</small>
        <strong>${allocatedMemory} MB</strong>
        <span>${allocatedBlocks.length} processes</span>
      </div>
      <div class="sim-stat-box">
        <small>FREE MEMORY</small>
        <strong>${frag.totalFree} MB</strong>
        <span>${frag.freeBlockCount} blocks</span>
      </div>
      <div class="sim-stat-box">
        <small>LARGEST FREE</small>
        <strong>${frag.largestFree} MB</strong>
        <span>Contiguous hole</span>
      </div>
      <div class="sim-stat-box">
        <small>EXT. FRAG</small>
        <strong>${frag.externalFragmentation} MB</strong>
        <span>${frag.fragmentationRate}% fragmented</span>
      </div>
      <div class="sim-stat-box">
        <small>SUCCESSFUL</small>
        <strong class="text-gain">${sim.successfulCount}</strong>
        <span>Allocations</span>
      </div>
      <div class="sim-stat-box">
        <small>FAILED</small>
        <strong class="${sim.failedCount > 0 ? 'text-danger' : ''}">${sim.failedCount}</strong>
        <span>No-fit events</span>
      </div>
    `;

    card.append(header, selectionBar, arenaWrap, statsGrid);
    return card;
  }

  function renderComparisonSummary() {
    if (!elements.summaryContent) return;
    elements.summaryContent.replaceChildren();

    const currentSims = getSimulators();
    const evaluatedActions = currentSims.map(s => s.lastAction).filter(Boolean);
    const currentQ = activeMode === "live" ? manager.queue : comparisonQueue;
    if (evaluatedActions.length === 0) {
      if (elements.divergenceChip) {
        elements.divergenceChip.textContent = "Awaiting Allocation";
        elements.divergenceChip.className = "heading-chip";
      }
      const emptyBox = document.createElement("div");
      emptyBox.className = "summary-empty-notice";
      emptyBox.innerHTML = `
        <strong>Simulation Scenario Active: ${activePreset.name}</strong><br>
        Comparison queue contains <b>${currentQ.length}</b> process request(s).
        Click <strong>Allocate Next</strong> or <strong>Run Queue</strong> to see First Fit, Best Fit, Worst Fit, and Next Fit make independent allocation decisions.
      `;
      elements.summaryContent.append(emptyBox);
      return;
    }

    const lastProcessId = evaluatedActions[0].pid;
    const lastProcessSize = evaluatedActions[0].size;
    const successfulSims = currentSims.filter(s => s.lastAction && s.lastAction.success);
    const uniqueOffsets = new Set(successfulSims.map(s => s.lastAction.offset));

    let divergenceTitle = "";
    let divergenceBadge = "";

    if (successfulSims.length === 4 && uniqueOffsets.size === 4) {
      divergenceBadge = "★ 4-Way Divergence";
      divergenceTitle = `All four algorithms made completely distinct allocation decisions for Process P${lastProcessId} (${lastProcessSize} MB), placing it at offsets: ${currentSims.map(s => `${s.label} @ ${s.lastAction ? s.lastAction.offset : 0}M`).join(", ")}.`;
    } else if (successfulSims.length > 0 && uniqueOffsets.size > 1) {
      divergenceBadge = `${uniqueOffsets.size} Different Offsets`;
      divergenceTitle = `Algorithms diverged into ${uniqueOffsets.size} different placement locations for Process P${lastProcessId} (${lastProcessSize} MB) based on their differing block selection criteria.`;
    } else if (successfulSims.length === 4 && uniqueOffsets.size === 1) {
      divergenceBadge = "Identical Block Fit";
      divergenceTitle = `All four algorithms selected Block @ ${Array.from(uniqueOffsets)[0]} MB for Process P${lastProcessId} (${lastProcessSize} MB) because only one suitable contiguous free block was large enough in memory (Requirement 11).`;
    } else if (successfulSims.length > 0) {
      divergenceBadge = "Partial Fits";
      divergenceTitle = `Process P${lastProcessId} (${lastProcessSize} MB) succeeded in ${successfulSims.length} algorithm(s) and failed in ${4 - successfulSims.length} algorithm(s) due to external fragmentation.`;
    } else {
      divergenceBadge = "All Rejected";
      divergenceTitle = `Process P${lastProcessId} (${lastProcessSize} MB) could not fit in any algorithm because no contiguous free block was large enough.`;
    }

    if (elements.divergenceChip) {
      elements.divergenceChip.textContent = divergenceBadge;
    }

    const headerBox = document.createElement("div");
    headerBox.className = "summary-eval-status";
    headerBox.innerHTML = `
      <strong>Process P${lastProcessId} (${lastProcessSize} MB) Allocation Analysis</strong>
      <p>${divergenceTitle}</p>
    `;

    const grid = document.createElement("div");
    grid.className = "comp-decision-grid";

    for (const sim of currentSims) {
      const action = sim.lastAction;
      const card = document.createElement("div");
      card.className = `decision-card ${sim.id}-decision`;

      if (!action) {
        card.innerHTML = `
          <div class="decision-head">
            <span class="policy-pill ${sim.id}-pill">${sim.label}</span>
            <span class="decision-status tag-ready">Ready</span>
          </div>
          <p class="text-muted" style="font-size: 9px; margin: 8px 0 0;">Awaiting process evaluation</p>
        `;
      } else if (action.success) {
        card.innerHTML = `
          <div class="decision-head">
            <span class="policy-pill ${sim.id}-pill">${sim.label}</span>
            <span class="decision-status tag-success">✓ Allocated</span>
          </div>
          <div class="decision-metrics">
            <div><small>SELECTED BLOCK</small><strong>Offset ${action.blockOffset}M (${action.blockSize}M hole)</strong></div>
            <div><small>STARTING ADDR</small><strong>${action.offset} MB</strong></div>
            <div><small>REMAINING HOLE</small><strong>${action.leftover} MB</strong></div>
          </div>
          <div class="decision-rationale">
            <small>DECISION RATIONALE</small>
            <p>${action.rationale}</p>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="decision-head">
            <span class="policy-pill ${sim.id}-pill">${sim.label}</span>
            <span class="decision-status tag-failure">✕ Rejected</span>
          </div>
          <div class="decision-metrics">
            <div><small>REQUEST</small><strong>${action.size} MB</strong></div>
            <div><small>REASON</small><strong class="text-danger">No Fit</strong></div>
            <div><small>RESULT</small><strong>Request Queued</strong></div>
          </div>
          <div class="decision-rationale">
            <small>FAILURE CAUSE</small>
            <p>${action.rationale || "No contiguous free memory block was large enough to fit this process."}</p>
          </div>
        `;
      }

      grid.append(card);
    }

    elements.summaryContent.append(headerBox, grid);
  }

  function renderMatrixTable() {
    if (!elements.matrixBody) return;
    elements.matrixBody.replaceChildren();

    const currentSims = getSimulators();
    const lowestFrag = Math.min(...currentSims.map(s => calculateFragmentation(s.blocks).externalFragmentation));

    for (const sim of currentSims) {
      const frag = calculateFragmentation(sim.blocks);
      const allocatedBlocks = sim.blocks.filter(b => b.pid !== null);
      const allocatedMemory = allocatedBlocks.reduce((sum, b) => sum + b.size, 0);

      const row = document.createElement("tr");

      // Algorithm
      const nameCell = document.createElement("td");
      nameCell.className = "comp-matrix-algo";
      nameCell.innerHTML = `<span class="policy-pill ${sim.id}-pill">${sim.label}</span>`;

      // Selection & Offset
      const selectCell = document.createElement("td");
      selectCell.className = "comp-matrix-selection";
      if (!sim.lastAction) {
        selectCell.innerHTML = `<span class="text-muted">Awaiting allocation</span>`;
      } else if (sim.lastAction.success) {
        selectCell.innerHTML = `<span class="badge-success-offset">✓ Offset <strong>${sim.lastAction.offset} MB</strong></span> <small>from block @ ${sim.lastAction.blockOffset}M (${sim.lastAction.blockSize}M)</small>`;
      } else {
        selectCell.innerHTML = `<span class="badge-failure-offset">✕ Failed</span> <small>${sim.lastAction.reason}</small>`;
      }

      // Allocated
      const allocCell = document.createElement("td");
      allocCell.innerHTML = `<strong>${allocatedMemory} MB</strong> <small>(${allocatedBlocks.length} procs)</small>`;

      // Free
      const freeCell = document.createElement("td");
      freeCell.innerHTML = `<strong>${frag.totalFree} MB</strong> <small>(${frag.freeBlockCount} blocks)</small>`;

      // Largest
      const largestCell = document.createElement("td");
      largestCell.innerHTML = `<strong>${frag.largestFree} MB</strong>`;

      // External Frag
      const fragCell = document.createElement("td");
      fragCell.innerHTML = `<strong>${frag.externalFragmentation} MB</strong> <small>(${frag.fragmentationRate}%)</small> ${frag.externalFragmentation === lowestFrag ? `<span class="chip-best-frag">Lowest</span>` : ""}`;

      // Success / Failed
      const countCell = document.createElement("td");
      countCell.innerHTML = `<strong class="text-gain">${sim.successfulCount}</strong> / <span class="${sim.failedCount > 0 ? 'text-danger' : 'text-muted'}">${sim.failedCount}</span>`;

      row.append(nameCell, selectCell, allocCell, freeCell, largestCell, fragCell, countCell);
      elements.matrixBody.append(row);
    }
  }

  function populateReleaseSelect() {
    if (!elements.releaseSelect) return;
    const activePids = new Set();
    for (const sim of getSimulators()) {
      for (const b of sim.blocks) {
        if (b.pid !== null) activePids.add(b.pid);
      }
    }

    elements.releaseSelect.replaceChildren();
    if (activePids.size === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No active processes to release";
      elements.releaseSelect.append(opt);
      if (elements.confirmReleaseBtn) elements.confirmReleaseBtn.disabled = true;
      return;
    }

    if (elements.confirmReleaseBtn) elements.confirmReleaseBtn.disabled = false;
    for (const pid of Array.from(activePids).sort((a, b) => a - b)) {
      const opt = document.createElement("option");
      opt.value = String(pid);
      opt.textContent = `Process P${pid}`;
      elements.releaseSelect.append(opt);
    }
  }

  function renderAll() {
    renderQueueChips();

    // Render 2x2 grid
    if (elements.simulatorsGrid) {
      elements.simulatorsGrid.replaceChildren();
      for (const sim of getSimulators()) {
        elements.simulatorsGrid.append(renderSimulatorCard(sim));
      }
    }

    renderComparisonSummary();
    renderMatrixTable();
    populateReleaseSelect();
  }

  function allocateNextShared() {
    if (manager.queue.length === 0) {
      showToast("Comparison queue is empty. Use '+ Add Process' to enqueue requests.");
      showBanner("info", "No pending processes in the comparison queue. Add requests to continue.");
      return false;
    }

    const res = manager.stepSharedAllocation();
    if (!res.success) return false;
    renderAll();
    showToast(`P${res.process.pid} (${res.process.size} MB) allocated across all 4 simulators.`);
    showBanner("success", `Process P${res.process.pid} (${res.process.size} MB) evaluated simultaneously: ${res.resultsSummary.join(" | ")}.`);
    return true;
  }

  function releaseProcessAcrossAll(pid) {
    if (!pid) return;
    const released = manager.release(pid);
    if (released) {
      showToast(`Process P${pid} released from all 4 simulators. Adjacent free blocks merged.`);
      showBanner("info", `Process P${pid} deallocated across all 4 simulators; free space coalesced.`);
    } else {
      showToast(`Process P${pid} was not found in any simulator.`);
    }

    if (elements.releasePanel) elements.releasePanel.classList.add("hidden");
    renderAll();
  }

  function stopRun() {
    if (runInterval !== null) window.clearInterval(runInterval);
    runInterval = null;
    if (elements.runBtn) {
      elements.runBtn.innerHTML = '<span class="play-icon">▶</span> Run Queue';
    }
  }

  // Event Listeners
  if (elements.presetDemoBtn) {
    elements.presetDemoBtn.addEventListener("click", () => {
      loadPreset(DEMONSTRATION_FRAGMENTED_PRESET, "demo");
      showToast("Loaded Fragmented Demonstration Scenario (4-Way Divergence).");
      showBanner("info", "Loaded Demonstration Scenario: 5 fragmented free holes [50, 220, 170, 190, 250 MB] with queued requests [P5: 150 MB, P6: 180 MB, P7: 60 MB].");
    });
  }

  if (elements.presetTestBtn) {
    elements.presetTestBtn.addEventListener("click", () => {
      loadPreset(TEST_BENCHMARK_PRESET, "benchmark");
      showToast("Loaded Benchmark Suite (300 / 500 / 200 MB Free Holes).");
      showBanner("info", "Loaded Benchmark Scenario: 3 separated free holes [300, 500, 200 MB] with 180 MB request waiting. Click 'Allocate Next' to see all algorithms select their optimal blocks.");
    });
  }

  if (elements.presetBaselineBtn) {
    elements.presetBaselineBtn.addEventListener("click", () => {
      loadPreset(STANDARD_SPEC_PRESET, "standard");
      showToast("Loaded Standard Specification Preset (7 Blocks, 3 Queued).");
      showBanner("info", "Loaded Standard Specification: 7 starting blocks with queued processes P6 (108 MB), P7 (256 MB), P8 (80 MB).");
    });
  }

  if (elements.presetCleanBtn) {
    elements.presetCleanBtn.addEventListener("click", () => {
      loadPreset(CLEAN_1024_PRESET, "clean");
      showToast("Initialized Clean 1,024 MB arena for all 4 algorithms.");
      showBanner("info", "Clean memory slate initialized: 1,024 MB contiguous free space across all 4 simulators.");
    });
  }

  if (elements.presetLiveBtn) {
    elements.presetLiveBtn.addEventListener("click", () => {
      loadLiveState(true);
    });
  }

  if (elements.stepBtn) {
    elements.stepBtn.addEventListener("click", () => {
      allocateNextShared();
    });
  }

  if (elements.runBtn) {
    elements.runBtn.addEventListener("click", () => {
      if (runInterval !== null) {
        stopRun();
        showToast("Comparison queue paused.");
        showBanner("info", "Comparison queue execution paused by user.");
        return;
      }

      const currentQ = activeMode === "live" ? manager.queue : comparisonQueue;
      if (currentQ.length === 0) {
        showToast("Comparison queue is empty. Add processes to run.");
        showBanner("info", "No processes to allocate in comparison queue.");
        return;
      }

      elements.runBtn.innerHTML = '<span class="play-icon">⏸</span> Pause';
      showBanner("info", "Executing comparison queue across all four algorithms sequentially...");
      runInterval = window.setInterval(() => {
        const q = activeMode === "live" ? manager.queue : comparisonQueue;
        if (q.length === 0) {
          stopRun();
          showToast("Comparison queue processed completely.");
          showBanner("success", "All comparison queue processes have been allocated across all 4 simulators.");
        } else if (!allocateNextShared()) {
          stopRun();
        }
      }, 700);
    });
  }

  if (elements.resetBtn) {
    elements.resetBtn.addEventListener("click", () => {
      stopRun();
      manager.resetTo1024();
      activeMode = "live";
      updatePresetButtons("live");
      if (elements.scenarioName) {
        elements.scenarioName.textContent = `Live Synchronized State (${manager.blocks.length} Blocks, ${manager.queue.length} Queued)`;
      }
      renderAll();
      showToast("Comparison reset: all four algorithms cleared to 1,024 MB free memory.");
      showBanner("info", "Reset all four algorithms to clean 1,024 MB free arena. Pending queue cleared.");
    });
  }

  if (elements.addProcBtn) {
    elements.addProcBtn.addEventListener("click", () => {
      if (elements.addForm) {
        elements.addForm.classList.toggle("hidden");
        if (!elements.addForm.classList.contains("hidden") && elements.sizeInput) {
          elements.sizeInput.focus();
        }
      }
    });
  }

  if (elements.cancelAddBtn) {
    elements.cancelAddBtn.addEventListener("click", () => {
      if (elements.addForm) elements.addForm.classList.add("hidden");
    });
  }

  if (elements.addForm) {
    elements.addForm.addEventListener("submit", event => {
      event.preventDefault();
      const size = Number(elements.sizeInput.value);
      const maxMem = manager.totalMemory || TOTAL_MEMORY;
      if (!Number.isInteger(size) || size < 1 || size > maxMem) {
        showToast(`Enter a whole number between 1 and ${maxMem.toLocaleString()} MB.`);
        return;
      }

      const rawPid = elements.pidInput ? elements.pidInput.value.trim() : "";
      let targetPid = null;
      if (rawPid !== "") {
        const parsed = Number(rawPid);
        if (!Number.isInteger(parsed) || parsed < 1) {
          showToast("Process ID must be a positive integer.");
          return;
        }
        const existsInSims = getSimulators().some(sim => sim.blocks.some(b => b.pid === parsed));
        if (existsInSims || manager.queue.some(p => p.pid === parsed) || manager.blocks.some(b => b.pid === parsed)) {
          showToast(`Process ID ${parsed} is already in use by an active or queued process.`);
          return;
        }
        targetPid = parsed;
      }

      const priority = Number(elements.priorityInput ? elements.priorityInput.value : 2) || 2;
      const added = manager.enqueueProcess(size, targetPid, priority);
      if (!added) {
        showToast("Unable to enqueue process. Check parameters.");
        return;
      }
      showToast(`Process P${added.pid} (${size} MB) added to comparison queue.`);
      showBanner("success", `Process P${added.pid} (${size} MB) queued for all 4 algorithms.`);
      renderAll();

      elements.addForm.classList.add("hidden");
      elements.addForm.reset();
    });
  }

  if (elements.releaseProcBtn) {
    elements.releaseProcBtn.addEventListener("click", () => {
      if (elements.releasePanel) {
        populateReleaseSelect();
        elements.releasePanel.classList.toggle("hidden");
      }
    });
  }

  if (elements.cancelReleaseBtn) {
    elements.cancelReleaseBtn.addEventListener("click", () => {
      if (elements.releasePanel) elements.releasePanel.classList.add("hidden");
    });
  }

  if (elements.confirmReleaseBtn) {
    elements.confirmReleaseBtn.addEventListener("click", () => {
      if (!elements.releaseSelect || !elements.releaseSelect.value) {
        showToast("Select a process to release.");
        return;
      }
      const pid = Number(elements.releaseSelect.value);
      releaseProcessAcrossAll(pid);
    });
  }

  manager.subscribe(() => {
    if (elements.scenarioName && activeMode === "live") {
      elements.scenarioName.textContent = `Live Synchronized State (${manager.blocks.length} Blocks, ${manager.queue.length} Queued)`;
    }
    renderAll();
  });

  // Default to live synchronized state on startup so the clean slate or live user queue is preserved across refresh
  loadLiveState(false);
}
