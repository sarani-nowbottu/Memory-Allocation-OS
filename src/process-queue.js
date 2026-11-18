import { showToast } from "./utils/feedback.js";
import { POLICY_LABELS } from "./algorithms/memory-allocation.js";

export function initializeProcessQueue(manager) {
  const elements = {
    queue: document.querySelector("#queue-list"),
    count: document.querySelector("#queue-count"),
    countStat: document.querySelector("#queue-count-stat"),
    demandStat: document.querySelector("#queue-demand-stat"),
    headStat: document.querySelector("#queue-head-stat"),
    policyStat: document.querySelector("#queue-policy-stat"),
    empty: document.querySelector("#queue-empty"),
    activity: document.querySelector("#activity-list"),
    add: document.querySelector("#add-process-button"),
    form: document.querySelector("#add-process-form"),
    size: document.querySelector("#process-size"),
    pid: document.querySelector("#process-pid"),
    priority: document.querySelector("#process-priority"),
    cancel: document.querySelector("#cancel-add-button"),
    clearLog: document.querySelector("#clear-log-button"),
    policySelect: document.querySelector("#queue-policy-select"),
    stepButton: document.querySelector("#queue-step-button"),
    runButton: document.querySelector("#queue-run-button"),
    compactButton: document.querySelector("#queue-compact-button"),
    resetCleanButton: document.querySelector("#queue-reset-clean-button"),
    resetExampleButton: document.querySelector("#queue-reset-example-button"),
    banner: document.querySelector("#queue-feedback-banner"),
    bannerIcon: document.querySelector("#queue-feedback-icon"),
    bannerText: document.querySelector("#queue-feedback-text")
  };

  let queueRunTimer = null;

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

  function createMeta(value, caption) {
    const meta = document.createElement("div");
    meta.className = "queue-meta";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const small = document.createElement("span");
    small.textContent = caption;
    meta.append(strong, small);
    return meta;
  }

  function renderQueue() {
    elements.queue.replaceChildren();
    const count = manager.queue.length;
    if (elements.count) elements.count.textContent = String(count);
    if (elements.countStat) elements.countStat.textContent = String(count);

    const totalDemand = manager.queue.reduce((sum, p) => sum + p.size, 0);
    if (elements.demandStat) elements.demandStat.innerHTML = `${totalDemand} <span>MB</span>`;

    if (elements.headStat) {
      if (count > 0) {
        elements.headStat.innerHTML = `P${manager.queue[0].pid} <span>(${manager.queue[0].size}M)</span>`;
      } else {
        elements.headStat.textContent = "None";
      }
    }

    if (elements.policySelect && elements.policySelect.value !== manager.policy) {
      elements.policySelect.value = manager.policy;
    }
    const currentPolicy = manager.policy || (elements.policySelect ? elements.policySelect.value : "first");
    if (elements.policyStat) elements.policyStat.textContent = POLICY_LABELS[currentPolicy] || "First Fit";

    if (elements.empty) {
      elements.empty.classList.toggle("hidden", count > 0);
      elements.empty.hidden = count > 0;
      elements.empty.style.display = count > 0 ? "none" : "";
    }

    for (const process of manager.queue) {
      const row = document.createElement("div");
      row.className = "queue-row";

      const name = document.createElement("div");
      name.className = "queue-process";
      const badge = document.createElement("span");
      badge.className = "process-badge";
      badge.textContent = `P${process.pid}`;
      const label = document.createElement("span");
      label.textContent = `Process ${process.pid}`;
      name.append(badge, label);

      const sizeMeta = createMeta(`${process.size} MB`, "REQUEST");
      const priorityLabel = process.priority === 1 ? "1 (High)" : process.priority === 2 ? "2 (Normal)" : process.priority === 3 ? "3 (Medium)" : `${process.priority}`;
      const priorityMeta = createMeta(`P${process.priority}`, priorityLabel);

      const actionWrap = document.createElement("div");
      actionWrap.className = "queue-actions-cell";
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-process-button";
      removeBtn.type = "button";
      removeBtn.innerHTML = "&times; Remove";
      removeBtn.title = `Remove Process ${process.pid} from queue`;
      removeBtn.setAttribute("aria-label", `Remove process ${process.pid}`);
      removeBtn.addEventListener("click", () => {
        manager.removeProcess(process.pid);
        showToast(`Process ${process.pid} removed from queue.`);
        showBanner("info", `Process ${process.pid} (${process.size} MB) removed from the pending queue.`);
      });
      actionWrap.append(removeBtn);

      row.append(name, sizeMeta, priorityMeta, actionWrap);
      elements.queue.append(row);
    }
  }

  function renderLog() {
    elements.activity.replaceChildren();
    if (!manager.logEntries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-log";
      empty.textContent = "No events recorded yet. Allocate a process to begin.";
      elements.activity.append(empty);
      return;
    }
    // Show top 6 events in the preview panel
    for (const entry of manager.logEntries.slice(0, 6)) {
      const row = document.createElement("div");
      row.className = "activity-row";
      const time = document.createElement("span");
      time.className = "activity-time";
      time.textContent = `${String(Math.floor(entry.time / 60)).padStart(2, "0")}:${String(entry.time % 60).padStart(2, "0")}`;
      const message = document.createElement("span");
      message.className = "activity-message";
      const title = document.createElement("strong");
      title.textContent = `${entry.title} · `;
      message.append(title, document.createTextNode(entry.detail));
      const kind = document.createElement("span");
      kind.className = `activity-kind ${entry.kind === "RELEASED" ? "release-kind" : entry.kind === "MERGED" ? "merge-kind" : entry.kind === "BLOCKED" ? "warning-kind" : ""}`;
      kind.textContent = entry.kind;
      row.append(time, message, kind);
      elements.activity.append(row);
    }
  }

  function stopRun() {
    if (queueRunTimer !== null) window.clearInterval(queueRunTimer);
    queueRunTimer = null;
    if (elements.runButton) {
      elements.runButton.innerHTML = '<span class="play-icon">▶</span> Run queue';
    }
  }

  function stepQueue() {
    const policy = elements.policySelect ? elements.policySelect.value : "first";
    const result = manager.allocateNext(policy);
    if (result.reason === "empty") {
      showToast("There are no pending processes.");
      showBanner("info", "Queue is empty. Add processes to continue.");
    } else if (result.reason === "no-fit") {
      const msg = `Allocation Failed: Process ${result.process.pid} (${result.process.size} MB) cannot fit into any free block using ${POLICY_LABELS[policy]}.`;
      showToast(msg);
      showBanner("failure", msg);
    } else {
      const msg = `Allocation Succeeded: Process ${result.process.pid} (${result.process.size} MB) allocated at offset ${result.offset} MB.`;
      showToast(msg);
      showBanner("success", msg);
    }
    return result.success;
  }

  if (elements.stepButton) {
    elements.stepButton.addEventListener("click", stepQueue);
  }

  if (elements.runButton) {
    elements.runButton.addEventListener("click", () => {
      if (queueRunTimer !== null) {
        stopRun();
        showToast("Queue execution paused.");
        showBanner("info", "Sequential queue processing paused.");
        return;
      }
      if (!manager.queue.length) {
        showToast("There are no pending processes.");
        showBanner("info", "Queue is currently empty.");
        return;
      }
      elements.runButton.innerHTML = '<span class="play-icon">⏸</span> Pause';
      showBanner("info", "Running queue allocations sequentially...");
      queueRunTimer = window.setInterval(() => {
        if (!manager.queue.length) {
          stopRun();
          showToast("All queued processes processed.");
          showBanner("success", "Queue execution complete.");
        } else if (!stepQueue()) {
          stopRun();
        }
      }, 800);
    });
  }

  if (elements.policySelect) {
    elements.policySelect.addEventListener("change", () => {
      manager.setPolicy(elements.policySelect.value);
      if (elements.policyStat) {
        elements.policyStat.textContent = POLICY_LABELS[elements.policySelect.value];
      }
      showToast(`Policy set to ${POLICY_LABELS[elements.policySelect.value]}`);
    });
  }

  if (elements.resetCleanButton) {
    elements.resetCleanButton.addEventListener("click", () => {
      stopRun();
      manager.resetTo1024();
      showToast("Simulation reset to 1,024 MB clean free space.");
      showBanner("info", "Memory arena reset to 1,024 MB clean free space. Queue is empty.");
    });
  }

  if (elements.resetExampleButton) {
    elements.resetExampleButton.addEventListener("click", () => {
      stopRun();
      manager.resetToExample();
      showToast("Loaded educational 7-block example layout.");
      showBanner("info", "Memory arena and queue reset to initial project configuration.");
    });
  }

  elements.add.addEventListener("click", () => {
    elements.form.classList.toggle("hidden");
    if (!elements.form.classList.contains("hidden")) {
      elements.size.focus();
    }
  });

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    const size = Number(elements.size.value);
    if (!Number.isInteger(size) || size < 1 || size > 1024) {
      showToast("Enter a whole number between 1 and 1,024 MB for memory size.");
      return;
    }

    const rawPid = elements.pid.value.trim();
    let targetPid = null;
    if (rawPid !== "") {
      const parsedPid = Number(rawPid);
      if (!Number.isInteger(parsedPid) || parsedPid < 1) {
        showToast("Process ID must be a positive integer.");
        return;
      }
      if (manager.blocks.some(b => b.pid === parsedPid) || manager.queue.some(p => p.pid === parsedPid)) {
        showToast(`Process ID ${parsedPid} is already in use by an active or queued process.`);
        return;
      }
      targetPid = parsedPid;
    }

    const priority = Number(elements.priority.value) || 2;
    const added = manager.enqueueProcess(size, targetPid, priority);
    if (!added) {
      showToast("Unable to enqueue process. Check parameters.");
      return;
    }

    showToast(`Process ${added.pid} (${size} MB, Priority ${priority}) added to queue.`);
    showBanner("success", `Process ${added.pid} (${size} MB) successfully enqueued.`);
    elements.form.classList.add("hidden");
    elements.form.reset();
  });

  if (elements.compactButton) {
    elements.compactButton.addEventListener("click", () => {
      const res = manager.compact();
      if (!res.success) {
        showToast(res.message);
        showBanner("info", res.message);
      } else {
        const moved = res.relocations.filter(r => r.moved).length;
        const msg = `Memory Arena Compacted: ${res.freeBlocksBefore} free fragments consolidated into one ${res.totalFree} MB contiguous block. ${moved} processes relocated.`;
        showToast(msg);
        showBanner("success", msg);
      }
    });
  }

  elements.cancel.addEventListener("click", () => elements.form.classList.add("hidden"));
  elements.clearLog.addEventListener("click", () => {
    manager.clearLog();
    showToast("Activity log cleared.");
  });

  manager.subscribe(() => {
    renderQueue();
    renderLog();
  });

  renderQueue();
  renderLog();
}
