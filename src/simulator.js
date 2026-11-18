import { findAllocation, placeAllocation, POLICY_LABELS, TOTAL_MEMORY, calculateFragmentation, simulatePolicy } from "./algorithms/memory-allocation.js";
import { showToast } from "./utils/feedback.js";

export function initializeSimulator(manager) {
  const elements = {
    policy: document.querySelector("#policy-select"),
    arena: document.querySelector("#memory-arena"),
    table: document.querySelector("#block-table-body"),
    pointer: document.querySelector("#pointer-value"),
    allocated: document.querySelector("#allocated-value"),
    allocatedCount: document.querySelector("#allocated-count"),
    free: document.querySelector("#free-value"),
    freeCount: document.querySelector("#free-count"),
    largest: document.querySelector("#largest-value"),
    fragValue: document.querySelector("#frag-value"),
    fragRate: document.querySelector("#frag-rate"),
    step: document.querySelector("#step-button"),
    run: document.querySelector("#run-button"),
    compact: document.querySelector("#compact-button"),
    compactionPanel: document.querySelector("#compaction-panel"),
    closeCompaction: document.querySelector("#close-compaction-button"),
    compactionContent: document.querySelector("#compaction-content"),
    reset: document.querySelector("#reset-button"),
    resetClean: document.querySelector("#reset-clean-button"),
    compare: document.querySelector("#compare-button"),
    comparison: document.querySelector("#comparison-panel"),
    closeComparison: document.querySelector("#close-comparison-button"),
    comparisonBody: document.querySelector("#comparison-table-body"),
    banner: document.querySelector("#simulator-feedback-banner"),
    bannerIcon: document.querySelector("#simulator-feedback-icon"),
    bannerText: document.querySelector("#simulator-feedback-text")
  };
  let runTimer = null;

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

  function renderArena() {
    elements.arena.replaceChildren();
    const namespace = "http://www.w3.org/2000/svg";
    const top = 36;
    const height = 400;
    const left = 300;
    const width = 190;
    const bottom = top + height;
    const createSvg = (tag, attributes, text) => {
      const element = document.createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const addText = (x, y, text, className, anchor = "middle") => {
      elements.arena.append(createSvg("text", { x, y, class: className, "text-anchor": anchor }, text));
    };

    elements.arena.setAttribute(
      "aria-label",
      `Memory layout: ${manager.blocks.length} blocks in ${TOTAL_MEMORY} megabytes. Low addresses are at the bottom.`
    );
    elements.arena.append(createSvg("rect", { x: left, y: top, width, height, rx: 7, class: "memory-outline" }));
    elements.arena.append(createSvg("line", { x1: 265, y1: top, x2: 265, y2: bottom, class: "axis-line" }));

    for (let offset = 0; offset <= TOTAL_MEMORY; offset += 256) {
      const y = top + ((TOTAL_MEMORY - offset) / TOTAL_MEMORY) * height;
      elements.arena.append(createSvg("line", { x1: 257, y1: y, x2: left, y2: y, class: "axis-tick" }));
      addText(247, y + 4, `${offset.toLocaleString()} MB`, "axis-label", "end");
    }
    addText(left + width / 2, 20, "HIGH ADDRESS (1,024 MB)", "address-caption");
    addText(left + width / 2, 460, "LOW ADDRESS (0 MB)", "address-caption");

    const callouts = manager.blocks
      .filter(block => block.size / TOTAL_MEMORY * height < 28)
      .map(block => ({
        block,
        targetY: top + ((TOTAL_MEMORY - block.offset - block.size / 2) / TOTAL_MEMORY) * height
      }))
      .sort((a, b) => a.targetY - b.targetY);
    const minGap = 18;
    for (let index = 0; index < callouts.length; index += 1) {
      callouts[index].labelY = Math.max(
        callouts[index].targetY,
        index === 0 ? top + 8 : callouts[index - 1].labelY + minGap
      );
    }
    for (let index = callouts.length - 1; index >= 0; index -= 1) {
      callouts[index].labelY = Math.min(callouts[index].labelY, bottom - 8 - (callouts.length - 1 - index) * minGap);
    }
    const calloutByBlock = new Map(callouts.map(callout => [callout.block, callout]));

    for (const block of manager.blocks) {
      const y = top + ((TOTAL_MEMORY - block.offset - block.size) / TOTAL_MEMORY) * height;
      const blockHeight = block.size / TOTAL_MEMORY * height;
      const isFree = block.pid === null;
      const group = createSvg("g", {
        "aria-label": isFree
          ? `Free block: ${block.size} megabytes at offset ${block.offset}`
          : `Process ${block.pid}: ${block.size} megabytes at offset ${block.offset}`,
        class: "diagram-segment"
      });
      group.append(createSvg("title", {}, isFree
        ? `Free · ${block.size} MB · offset ${block.offset} MB`
        : `Process ${block.pid} · ${block.size} MB · offset ${block.offset} MB. Click to release.`));
      group.append(createSvg("rect", {
        x: left + 1, y, width: width - 2, height: blockHeight,
        class: `diagram-block ${isFree ? "free" : "allocated"}`
      }));
      if (!isFree) {
        group.style.cursor = "pointer";
        group.addEventListener("click", () => {
          manager.release(block.pid);
          showBanner("info", `Process ${block.pid} released. Adjacent free memory blocks coalesced.`);
          showToast(`Process ${block.pid} released and merged.`);
        });
      }

      const label = isFree ? "FREE" : `P${block.pid}`;
      if (blockHeight >= 28) {
        group.append(createSvg("text", {
          x: left + width / 2,
          y: y + blockHeight / 2 + (blockHeight >= 43 ? -2 : 4),
          class: `block-label ${isFree ? "free" : "allocated"}`
        }, label));
        if (blockHeight >= 43) {
          group.append(createSvg("text", {
            x: left + width / 2,
            y: y + blockHeight / 2 + 13,
            class: `block-size-label ${isFree ? "free" : "allocated"}`
          }, `${block.size} MB`));
        }
      } else {
        const callout = calloutByBlock.get(block);
        group.append(createSvg("line", {
          x1: left + width, y1: callout.labelY, x2: left + width + 15, y2: callout.labelY, class: "callout-line"
        }));
        group.append(createSvg("circle", {
          cx: left + width, cy: callout.targetY, r: 2.5, class: `diagram-block ${isFree ? "free" : "allocated"}`
        }));
        group.append(createSvg("text", {
          x: left + width + 21, y: callout.labelY + 3, class: "callout-label"
        }, `${label} · ${block.size} MB`));
      }
      elements.arena.append(group);
    }

    const pointerY = top + ((TOTAL_MEMORY - manager.pointer) / TOTAL_MEMORY) * height;
    elements.arena.append(createSvg("line", {
      x1: left - 12, y1: pointerY, x2: left + width + 12, y2: pointerY, class: "next-fit-line"
    }));
    elements.arena.append(createSvg("circle", {
      cx: left + width + 12, cy: pointerY, r: 4, class: "next-fit-dot"
    }));
    addText(left + width + 24, 20, `NEXT FIT POINTER · ${manager.pointer} MB`, "pointer-label", "start");
  }

  function renderTable() {
    elements.table.replaceChildren();
    manager.blocks.forEach((block, index) => {
      const row = document.createElement("tr");
      for (const value of [`B${String(index + 1).padStart(2, "0")}`, `${block.offset} MB`, `${block.size} MB`]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const status = document.createElement("td");
      status.className = "status-cell";
      const tag = document.createElement("span");
      tag.className = `status-tag ${block.pid === null ? "free-status" : "allocated-status"}`;
      tag.textContent = block.pid === null ? "Free" : "Allocated";
      status.append(tag);
      row.append(status);
      const process = document.createElement("td");
      process.className = "process-cell";
      process.textContent = block.pid === null ? "—" : `Process ${block.pid}`;
      row.append(process);
      const action = document.createElement("td");
      action.className = "release-cell";
      if (block.pid !== null) {
        const button = document.createElement("button");
        button.className = "release-button";
        button.type = "button";
        button.textContent = "Release";
        button.setAttribute("aria-label", `Release process ${block.pid}`);
        button.addEventListener("click", () => {
          manager.release(block.pid);
          showBanner("info", `Process ${block.pid} released. Adjacent free blocks merged.`);
          showToast(`Process ${block.pid} released and merged.`);
        });
        action.append(button);
      }
      row.append(action);
      elements.table.append(row);
    });
  }

  function renderStats() {
    const allocated = manager.blocks.filter(block => block.pid !== null);
    const available = manager.blocks.filter(block => block.pid === null);
    const usedMemory = allocated.reduce((sum, block) => sum + block.size, 0);
    const largest = available.reduce((size, block) => Math.max(size, block.size), 0);
    const frag = calculateFragmentation(manager.blocks);

    elements.allocated.innerHTML = `${usedMemory} <span>MB</span>`;
    elements.allocatedCount.textContent = String(allocated.length);
    elements.free.innerHTML = `${TOTAL_MEMORY - usedMemory} <span>MB</span>`;
    elements.freeCount.textContent = String(available.length);
    elements.largest.innerHTML = `${largest} <span>MB</span>`;
    elements.pointer.innerHTML = `${manager.pointer} <span>MB</span>`;

    if (elements.fragValue) elements.fragValue.innerHTML = `${frag.externalFragmentation} <span>MB</span>`;
    if (elements.fragRate) elements.fragRate.textContent = `${frag.fragmentationRate}%`;
    if (elements.policy && elements.policy.value !== manager.policy) {
      elements.policy.value = manager.policy;
    }
  }

  function renderCompactionBar(blocksList) {
    const bar = document.createElement("div");
    bar.className = "compaction-arena-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", "Memory layout comparison bar");

    for (const b of blocksList) {
      const seg = document.createElement("div");
      const pct = (b.size / TOTAL_MEMORY) * 100;
      seg.style.width = `${pct}%`;
      seg.className = `compaction-seg ${b.pid === null ? "seg-free" : "seg-allocated"}`;
      seg.title = b.pid === null
        ? `Free: ${b.size} MB (${b.offset} - ${b.offset + b.size} MB)`
        : `P${b.pid}: ${b.size} MB (${b.offset} - ${b.offset + b.size} MB)`;

      if (pct > 7) {
        seg.textContent = b.pid === null ? `Free (${b.size}M)` : `P${b.pid} (${b.size}M)`;
      } else if (pct > 3.5) {
        seg.textContent = b.pid === null ? `F` : `P${b.pid}`;
      }
      bar.append(seg);
    }
    return bar;
  }

  function renderCompactionReport(res) {
    if (!elements.compactionContent) return;
    elements.compactionContent.replaceChildren();

    const fragBefore = calculateFragmentation(res.beforeBlocks);
    const fragAfter = calculateFragmentation(res.afterBlocks);
    const movedProcesses = res.relocations.filter(r => r.moved);

    // 1. Overview description
    const intro = document.createElement("div");
    intro.className = "compaction-intro";
    intro.innerHTML = `
      <p>All <strong>${res.relocations.length} active processes</strong> have been relocated contiguously to the bottom of physical memory (addresses <strong>0 MB – ${res.totalAllocated} MB</strong>) without altering process sizes. All <strong>${res.freeBlocksBefore} scattered free fragments</strong> were consolidated into a single contiguous <strong>${res.totalFree} MB region</strong>.</p>
    `;

    // 2. Metrics comparison
    const metricsGrid = document.createElement("div");
    metricsGrid.className = "compaction-metrics-grid";
    metricsGrid.innerHTML = `
      <div class="compaction-stat-chip">
        <small>FREE BLOCKS</small>
        <strong>${res.freeBlocksBefore} blocks &rarr; 1 contiguous</strong>
      </div>
      <div class="compaction-stat-chip">
        <small>LARGEST FREE BLOCK</small>
        <strong>${res.largestFreeBefore} MB &rarr; ${res.totalFree} MB <span class="text-gain">(+${res.totalFree - res.largestFreeBefore} MB)</span></strong>
      </div>
      <div class="compaction-stat-chip">
        <small>EXTERNAL FRAGMENTATION</small>
        <strong>${fragBefore.externalFragmentation} MB (${fragBefore.fragmentationRate}%) &rarr; 0 MB (0%)</strong>
      </div>
      <div class="compaction-stat-chip">
        <small>RELOCATED PROCESSES</small>
        <strong>${movedProcesses.length} of ${res.relocations.length} relocated</strong>
      </div>
    `;

    // 3. Before Visual Bar
    const beforeSection = document.createElement("div");
    beforeSection.className = "compaction-visual-section";
    const beforeLabel = document.createElement("div");
    beforeLabel.className = "compaction-visual-label";
    beforeLabel.innerHTML = `<span>BEFORE COMPACTION (Fragmented Free Holes)</span> <span>Largest Free: ${res.largestFreeBefore} MB &middot; Ext. Frag: ${fragBefore.externalFragmentation} MB</span>`;
    beforeSection.append(beforeLabel, renderCompactionBar(res.beforeBlocks));

    // 4. After Visual Bar
    const afterSection = document.createElement("div");
    afterSection.className = "compaction-visual-section";
    const afterLabel = document.createElement("div");
    afterLabel.className = "compaction-visual-label";
    afterLabel.innerHTML = `<span>AFTER COMPACTION (Tightly Packed at 0–${res.totalAllocated} MB &middot; Free at ${res.totalAllocated}–1024 MB)</span> <span class="text-gain">Largest Free: ${res.totalFree} MB &middot; Ext. Frag: 0 MB</span>`;
    afterSection.append(afterLabel, renderCompactionBar(res.afterBlocks));

    // 5. Relocations Table
    const relocSection = document.createElement("div");
    relocSection.className = "compaction-reloc-section";
    const relocTitle = document.createElement("h4");
    relocTitle.textContent = "Process Address Relocation Map";
    relocSection.append(relocTitle);

    const relocTable = document.createElement("table");
    relocTable.className = "compaction-reloc-table";
    relocTable.innerHTML = `
      <thead>
        <tr><th>PROCESS</th><th>SIZE</th><th>PREVIOUS ADDRESS</th><th>NEW ADDRESS</th><th>RELOCATION SHIFT</th></tr>
      </thead>
      <tbody>
        ${res.relocations.map(r => `
          <tr>
            <td><strong>P${r.pid}</strong></td>
            <td>${r.size} MB</td>
            <td>${r.oldOffset} MB</td>
            <td><strong>${r.newOffset} MB</strong></td>
            <td>${r.moved ? `<span class="badge-shifted">&Delta; ${r.oldOffset - r.newOffset} MB shift</span>` : `<span class="badge-unchanged">No shift</span>`}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
    relocSection.append(relocTable);

    // 6. Impact on Pending Queue Action
    const nextInQueue = manager.queue[0];
    const footerAction = document.createElement("div");
    footerAction.className = "compaction-footer-action";

    if (nextInQueue) {
      const fits = nextInQueue.size <= res.totalFree;
      footerAction.innerHTML = `
        <div class="compaction-queue-alert ${fits ? 'alert-fits' : 'alert-still-large'}">
          <strong>Pending Request: Process P${nextInQueue.pid} (${nextInQueue.size} MB)</strong>
          <p>${fits ? `Now fits within the unified ${res.totalFree} MB contiguous free block!` : `Requires ${nextInQueue.size} MB, which still exceeds total available free memory (${res.totalFree} MB).`}</p>
        </div>
        ${fits ? `<button class="button button-primary" id="compaction-step-btn" type="button">Allocate Process ${nextInQueue.pid} Now &rsaquo;</button>` : ""}
        <button class="button button-outline" id="compaction-done-btn" type="button">Close Report</button>
      `;
    } else {
      footerAction.innerHTML = `
        <div class="compaction-queue-alert alert-fits">
          <strong>Queue is Empty</strong>
          <p>Any future incoming request up to <strong>${res.totalFree} MB</strong> can now be allocated in a single contiguous block.</p>
        </div>
        <button class="button button-outline" id="compaction-done-btn" type="button">Close Report</button>
      `;
    }

    elements.compactionContent.append(intro, metricsGrid, beforeSection, afterSection, relocSection, footerAction);

    const stepBtn = elements.compactionContent.querySelector("#compaction-step-btn");
    if (stepBtn) {
      stepBtn.addEventListener("click", () => {
        elements.compactionPanel.hidden = true;
        stepQueue();
      });
    }

    const doneBtn = elements.compactionContent.querySelector("#compaction-done-btn");
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        elements.compactionPanel.hidden = true;
      });
    }

    elements.compactionPanel.hidden = false;
  }

  function handleCompact() {
    const res = manager.compact();
    if (!res.success) {
      showToast(res.message);
      showBanner("info", res.message);
      return;
    }

    const moved = res.relocations.filter(r => r.moved).length;
    const msg = `Memory Arena Compacted: ${res.freeBlocksBefore} free holes consolidated into one ${res.totalFree} MB contiguous block. ${moved} processes relocated.`;
    showToast(msg);
    showBanner("success", msg);
    renderCompactionReport(res);
  }

  function renderComparison() {
    const results = Object.entries(POLICY_LABELS).map(([policy]) => {
      return simulatePolicy(manager.blocks, manager.queue, manager.pointer, policy);
    });

    elements.comparisonBody.replaceChildren();
    for (const result of results) {
      const row = document.createElement("tr");
      const policy = document.createElement("td");
      policy.className = "comparison-policy";
      policy.textContent = result.label;

      const placements = document.createElement("td");
      placements.className = `comparison-placement${result.placements.length ? "" : " comparison-empty"}`;
      placements.textContent = result.placements.length
        ? result.placements.map(p => `P${p.pid} @ ${p.offset}M`).join(" · ")
        : "No allocations";

      const unplaced = document.createElement("td");
      unplaced.className = result.unplaced.length ? "comparison-unplaced" : "";
      unplaced.textContent = result.unplaced.length
        ? result.unplaced.map(p => `P${p.pid}`).join(", ")
        : "None";

      const largest = document.createElement("td");
      largest.textContent = `${result.largestFree} MB`;

      const frag = document.createElement("td");
      frag.textContent = `${result.externalFragmentation} MB (${result.fragmentationRate}%)`;

      row.append(policy, placements, unplaced, largest, frag);
      elements.comparisonBody.append(row);
    }
    elements.comparison.hidden = false;
  }

  function stopRun() {
    if (runTimer !== null) window.clearInterval(runTimer);
    runTimer = null;
    elements.run.innerHTML = '<span class="play-icon">▶</span> Run queue';
  }

  function stepQueue() {
    const result = manager.allocateNext(elements.policy.value);
    if (result.reason === "empty") {
      showToast("There are no pending processes in the queue.");
      showBanner("info", "Queue is currently empty. Add more processes from the Process Queue page.");
    } else if (result.reason === "no-fit") {
      const msg = `Allocation Failed: Process ${result.process.pid} (${result.process.size} MB) cannot fit into any available free block under ${POLICY_LABELS[elements.policy.value]}.`;
      showToast(msg);
      showBanner("failure", msg);
    } else {
      const msg = `Allocation Succeeded: Process ${result.process.pid} (${result.process.size} MB) allocated at address offset ${result.offset} MB using ${POLICY_LABELS[elements.policy.value]}.`;
      showToast(msg);
      showBanner("success", msg);
    }
    return result.success;
  }

  elements.step.addEventListener("click", stepQueue);
  elements.run.addEventListener("click", () => {
    if (runTimer !== null) {
      stopRun();
      showToast("Queue execution paused.");
      showBanner("info", "Sequential allocation paused by user.");
      return;
    }
    if (!manager.queue.length) {
      showToast("There are no pending processes.");
      showBanner("info", "No processes waiting in the queue.");
      return;
    }
    elements.run.innerHTML = '<span class="play-icon">⏸</span> Pause';
    showBanner("info", "Processing waiting processes sequentially...");
    runTimer = window.setInterval(() => {
      if (!manager.queue.length) {
        stopRun();
        showToast("Queue processed completely.");
        showBanner("success", "All eligible queued processes have been allocated.");
      } else if (!stepQueue()) {
        stopRun();
      }
    }, 800);
  });

  if (elements.compact) {
    elements.compact.addEventListener("click", handleCompact);
  }

  if (elements.closeCompaction) {
    elements.closeCompaction.addEventListener("click", () => {
      elements.compactionPanel.hidden = true;
    });
  }

  if (elements.resetClean) {
    elements.resetClean.addEventListener("click", () => {
      stopRun();
      if (elements.comparison) elements.comparison.hidden = true;
      if (elements.compactionPanel) elements.compactionPanel.hidden = true;
      manager.resetTo1024();
      showToast("Memory arena reset to 1,024 MB clean free space.");
      showBanner("info", "Clean memory slate initialized: 1,024 MB contiguous free space, queue empty.");
    });
  }

  elements.reset.addEventListener("click", () => {
    stopRun();
    if (elements.comparison) elements.comparison.hidden = true;
    if (elements.compactionPanel) elements.compactionPanel.hidden = true;
    manager.resetToExample();
    showToast("Simulation reset to default specification.");
    showBanner("info", "Memory arena and queue reset to initial project configuration.");
  });

  elements.compare.addEventListener("click", renderComparison);
  elements.closeComparison.addEventListener("click", () => {
    elements.comparison.hidden = true;
  });

  elements.policy.addEventListener("change", () => {
    manager.setPolicy(elements.policy.value);
    showToast(`Policy set to ${POLICY_LABELS[elements.policy.value]}`);
  });

  manager.subscribe(() => {
    renderArena();
    renderTable();
    renderStats();
  });

  renderArena();
  renderTable();
  renderStats();
}
