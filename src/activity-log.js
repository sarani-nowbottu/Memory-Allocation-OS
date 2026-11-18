import { showToast } from "./utils/feedback.js";

export function initializeActivityLog(manager) {
  const elements = {
    totalStat: document.querySelector("#log-stat-total"),
    allocStat: document.querySelector("#log-stat-allocated"),
    relStat: document.querySelector("#log-stat-released"),
    mergeStat: document.querySelector("#log-stat-merged"),
    blockStat: document.querySelector("#log-stat-blocked"),
    filterTabs: document.querySelectorAll(".log-filter-tabs .filter-tab"),
    searchInput: document.querySelector("#log-search-input"),
    tableBody: document.querySelector("#activity-table-body"),
    emptyState: document.querySelector("#log-empty-state"),
    countChip: document.querySelector("#log-count-chip"),
    clearBtn: document.querySelector("#clear-activity-log-page-btn")
  };

  let activeFilter = "all";
  let searchKeyword = "";

  function getFilteredEntries() {
    return manager.logEntries.filter(entry => {
      // Filter tab check
      if (activeFilter === "SYSTEM") {
        if (!["SYSTEM", "QUEUED", "POLICY"].includes(entry.kind)) return false;
      } else if (activeFilter !== "all") {
        if (entry.kind !== activeFilter) return false;
      }

      // Search keyword check
      if (searchKeyword.trim() !== "") {
        const query = searchKeyword.toLowerCase();
        const text = `${entry.kind} ${entry.title} ${entry.detail} ${entry.processId ? `P${entry.processId}` : ""}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }

  function renderStats() {
    const total = manager.logEntries.length;
    const allocated = manager.logEntries.filter(e => e.kind === "ALLOCATED").length;
    const released = manager.logEntries.filter(e => e.kind === "RELEASED").length;
    const merged = manager.logEntries.filter(e => e.kind === "MERGED").length;
    const blocked = manager.logEntries.filter(e => e.kind === "BLOCKED").length;

    if (elements.totalStat) elements.totalStat.textContent = String(total);
    if (elements.allocStat) elements.allocStat.textContent = String(allocated);
    if (elements.relStat) elements.relStat.textContent = String(released);
    if (elements.mergeStat) elements.mergeStat.textContent = String(merged);
    if (elements.blockStat) elements.blockStat.textContent = String(blocked);
  }

  function renderTable() {
    renderStats();
    if (!elements.tableBody) return;
    elements.tableBody.replaceChildren();

    const filtered = getFilteredEntries();
    if (elements.countChip) {
      elements.countChip.textContent = `${filtered.length} of ${manager.logEntries.length} entries`;
    }

    if (elements.emptyState) {
      elements.emptyState.classList.toggle("hidden", filtered.length > 0);
    }

    for (const entry of filtered) {
      const row = document.createElement("tr");

      // Time column (Elapsed + Wall Clock)
      const timeCell = document.createElement("td");
      timeCell.className = "log-time-cell";
      const elapsed = `${String(Math.floor(entry.time / 60)).padStart(2, "0")}:${String(entry.time % 60).padStart(2, "0")}`;
      timeCell.innerHTML = `<strong>${elapsed}</strong> <small>${entry.timestamp || ""}</small>`;

      // Kind / Badge column
      const kindCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `log-kind-tag log-kind-${entry.kind.toLowerCase()}`;
      badge.textContent = entry.kind;
      kindCell.append(badge);

      // Process ID column
      const pidCell = document.createElement("td");
      pidCell.className = "log-pid-cell";
      if (entry.processId) {
        pidCell.innerHTML = `<span class="process-badge">P${entry.processId}</span>`;
      } else {
        pidCell.textContent = "—";
      }

      // Details column
      const detailCell = document.createElement("td");
      detailCell.className = "log-detail-cell";
      const strong = document.createElement("strong");
      strong.textContent = entry.title;
      const desc = document.createElement("p");
      desc.textContent = entry.detail;
      detailCell.append(strong, desc);

      row.append(timeCell, kindCell, pidCell, detailCell);
      elements.tableBody.append(row);
    }
  }

  // Filter tabs listeners
  if (elements.filterTabs) {
    elements.filterTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        elements.filterTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeFilter = tab.dataset.filter;
        renderTable();
      });
    });
  }

  // Search input listener
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", event => {
      searchKeyword = event.target.value;
      renderTable();
    });
  }

  // Clear button listener
  if (elements.clearBtn) {
    elements.clearBtn.addEventListener("click", () => {
      manager.clearLog();
      showToast("Activity log cleared.");
      renderTable();
    });
  }

  manager.subscribe(() => {
    renderTable();
  });

  renderTable();
}
