import { POLICY_LABELS } from "./algorithms/memory-allocation.js";
import { showToast } from "./utils/feedback.js";

export function initializeOverview(manager) {
  const elements = {
    policy: document.querySelector("#overview-active-policy"),
    policyNote: document.querySelector("#overview-policy-note"),
    allocatedMem: document.querySelector("#overview-allocated-mem"),
    allocatedCount: document.querySelector("#overview-allocated-count"),
    freeMem: document.querySelector("#overview-free-mem"),
    freeCount: document.querySelector("#overview-free-count"),
    queueCount: document.querySelector("#overview-queue-count"),
    queueDemand: document.querySelector("#overview-queue-demand"),
    cleanResetBtn: document.querySelector("#overview-reset-clean-btn"),
    exampleResetBtn: document.querySelector("#overview-reset-example-btn")
  };

  const policyNotes = {
    first: "Scans memory from address 0 for first suitable block",
    next: "Continues circular scan from previous allocation offset",
    best: "Selects smallest block with minimum leftover hole",
    worst: "Selects largest block leaving maximum leftover space"
  };

  function updateOverviewState() {
    const stats = manager.getStats();

    if (elements.policy) {
      elements.policy.textContent = POLICY_LABELS[stats.policy] || stats.policy;
    }
    if (elements.policyNote) {
      elements.policyNote.textContent = policyNotes[stats.policy] || "Active allocation strategy";
    }
    if (elements.allocatedMem) {
      elements.allocatedMem.innerHTML = `${stats.allocatedMemory} <span>MB</span>`;
    }
    if (elements.allocatedCount) {
      elements.allocatedCount.textContent = `${stats.allocatedCount} ${stats.allocatedCount === 1 ? 'process' : 'processes'} active`;
    }
    if (elements.freeMem) {
      elements.freeMem.innerHTML = `${stats.freeMemory} <span>MB</span>`;
    }
    if (elements.freeCount) {
      elements.freeCount.textContent = `${stats.freeCount} ${stats.freeCount === 1 ? 'block' : 'blocks'} available`;
    }
    if (elements.queueCount) {
      elements.queueCount.textContent = `${stats.queueCount} ${stats.queueCount === 1 ? 'process' : 'processes'} waiting`;
    }
    if (elements.queueDemand) {
      elements.queueDemand.textContent = `${stats.queueDemand} MB total demand`;
    }
  }

  if (elements.cleanResetBtn) {
    elements.cleanResetBtn.addEventListener("click", () => {
      manager.resetTo1024();
      showToast("Simulation reset to 1,024 MB clean free space.");
    });
  }

  if (elements.exampleResetBtn) {
    elements.exampleResetBtn.addEventListener("click", () => {
      manager.resetToExample();
      showToast("Loaded educational 7-block example layout.");
    });
  }

  manager.subscribe(updateOverviewState);
  updateOverviewState();
}
