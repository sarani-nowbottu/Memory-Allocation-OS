export function renderActivityLogPage() {
  return `
    <div class="activity-log-page">
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> AUDIT TRAIL</div>
          <h1>Simulation Activity Log</h1>
          <p class="subtitle">Real-time chronologically sorted audit trail of all memory management actions: allocations, process releases, block coalescing, and blocked requests.</p>
        </div>
        <div class="heading-actions">
          <button class="button button-outline" id="clear-activity-log-page-btn" type="button"><span class="reset-icon">⌫</span> Clear Activity Log</button>
        </div>
      </div>

      <!-- Activity KPI Bar -->
      <div class="stats-grid activity-stats-grid" aria-label="Activity statistics">
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">TOTAL EVENTS</span><span class="stat-symbol total-symbol">Σ</span></div>
          <div class="stat-value" id="log-stat-total">0</div>
          <div class="stat-foot">Recorded operations</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">ALLOCATIONS</span><span class="stat-symbol alloc-symbol"><i></i></span></div>
          <div class="stat-value" id="log-stat-allocated">0</div>
          <div class="stat-foot">Processes placed in arena</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">RELEASES</span><span class="stat-symbol free-symbol">↗</span></div>
          <div class="stat-value" id="log-stat-released">0</div>
          <div class="stat-foot">Deallocated processes</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">BLOCK MERGES</span><span class="stat-symbol merge-symbol">⇄</span></div>
          <div class="stat-value" id="log-stat-merged">0</div>
          <div class="stat-foot">Coalescing operations</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">BLOCKED / FAILED</span><span class="stat-symbol warn-symbol">✕</span></div>
          <div class="stat-value" id="log-stat-blocked">0</div>
          <div class="stat-foot">Insufficient free space</div>
        </article>
      </div>

      <!-- Filter Controls Panel -->
      <section class="panel log-control-panel" aria-label="Log filter controls">
        <div class="log-filter-tabs" id="log-filter-tabs">
          <button class="filter-tab active" data-filter="all" type="button">All Events</button>
          <button class="filter-tab" data-filter="ALLOCATED" type="button">Allocated</button>
          <button class="filter-tab" data-filter="RELEASED" type="button">Released</button>
          <button class="filter-tab" data-filter="MERGED" type="button">Merged</button>
          <button class="filter-tab" data-filter="COMPACTED" type="button">Compacted</button>
          <button class="filter-tab" data-filter="BLOCKED" type="button">Blocked</button>
          <button class="filter-tab" data-filter="SYSTEM" type="button">Queue & System</button>
        </div>
        <div class="log-search-wrap">
          <input id="log-search-input" type="search" placeholder="Filter by PID or keyword..." aria-label="Search activity log">
        </div>
      </section>

      <!-- Events Table Panel -->
      <section class="panel log-table-panel" aria-labelledby="activity-table-title">
        <div class="panel-heading">
          <div>
            <div class="section-kicker">EVENT AUDIT LOG</div>
            <h2 id="activity-table-title">Recorded System Events</h2>
          </div>
          <span class="heading-chip" id="log-count-chip">0 entries</span>
        </div>
        <div class="activity-table-wrap">
          <table class="activity-table">
            <thead>
              <tr>
                <th style="width: 14%;">TIME</th>
                <th style="width: 13%;">EVENT TYPE</th>
                <th style="width: 12%;">PROCESS</th>
                <th style="width: 61%;">DESCRIPTION & MEMORY DETAILS</th>
              </tr>
            </thead>
            <tbody id="activity-table-body"></tbody>
          </table>
          <div class="log-empty-state hidden" id="log-empty-state">
            <div class="empty-icon">◷</div>
            <strong>No matching activity events</strong>
            <p>No logged actions match the selected filter or search keyword.</p>
          </div>
        </div>
      </section>
    </div>`;
}
