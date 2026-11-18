export function renderComparisonPage() {
  return `
    <div class="comparison-page">
      <div class="page-heading comp-page-heading">
        <div class="comp-heading-content">
          <div class="eyebrow"><span class="eyebrow-line"></span> REAL-TIME MULTI-SIMULATOR BENCHMARK</div>
          <h1>Side-by-Side Algorithm Comparison</h1>
          <p class="subtitle">Interact with four independent memory simulators running First Fit, Best Fit, Worst Fit, and Next Fit simultaneously. Enqueue shared processes, observe real-time block selection, and compare fragmentation dynamically.</p>
        </div>
        <div class="comp-preset-strip" aria-label="Benchmark Scenarios">
          <div class="comp-preset-header">
            <span class="comp-preset-title">BENCHMARK SCENARIO PRESETS</span>
            <small class="comp-preset-subtitle">Choose a workload layout to compare allocation behaviors:</small>
          </div>
          <div class="heading-actions comp-preset-actions">
            <button class="button button-outline" id="comp-preset-demo-btn" type="button">★ Fragmented Demo (Different Decisions)</button>
            <button class="button button-outline" id="comp-preset-test-btn" type="button">Benchmark Suite (300/500/200 MB Holes)</button>
            <button class="button button-outline" id="comp-preset-baseline-btn" type="button">Default Preset (7 Blocks)</button>
            <button class="button button-primary" id="comp-preset-live-btn" type="button">Live Synchronized State</button>
            <button class="button button-outline" id="comp-preset-clean-btn" type="button">Clean 1,024 MB</button>
          </div>
        </div>
      </div>

      <!-- Feedback Banner -->
      <div class="feedback-banner hidden" id="comparison-feedback-banner" role="status" aria-live="polite">
        <span class="feedback-icon" id="comp-feedback-icon">ℹ</span>
        <div class="feedback-text" id="comp-feedback-text">Ready to run side-by-side memory allocation comparison.</div>
      </div>

      <!-- Shared Control Bar -->
      <section class="control-panel comparison-control-panel" aria-label="Shared simulation controls">
        <div class="comp-control-info">
          <span class="control-label">CURRENT BENCHMARK SCENARIO</span>
          <strong id="comp-active-scenario-name">Live Synchronized State (1 Block, 0 Queued)</strong>
        </div>
        <div class="control-divider"></div>
        <div class="control-actions comp-control-actions">
          <button class="button button-outline" id="comp-add-proc-btn" type="button"><span>+</span> Add Process</button>
          <button class="button button-outline" id="comp-step-btn" type="button"><span class="step-icon">›</span> Allocate Next</button>
          <button class="button button-primary" id="comp-run-btn" type="button"><span class="play-icon">▶</span> Run Queue</button>
          <button class="button button-outline" id="comp-release-proc-btn" type="button"><span class="reset-icon">⌫</span> Release Process</button>
          <button class="button button-quiet" id="comp-reset-btn" type="button"><span class="reset-icon">↺</span> Reset Comparison</button>
        </div>
      </section>

      <!-- Shared Add Process Form -->
      <form class="add-process-form hidden" id="comp-add-proc-form" aria-label="Add process to shared comparison queue">
        <div class="form-title">
          <strong>Add Process to Comparison Workload</strong>
          <small>This request will be sent to all four algorithms simultaneously</small>
        </div>
        <div class="add-process-grid">
          <div class="form-field">
            <label for="comp-proc-size">MEMORY SIZE (MB) *</label>
            <input id="comp-proc-size" name="size" type="number" min="1" max="1024" step="1" value="180" required placeholder="e.g. 180">
          </div>
          <div class="form-field">
            <label for="comp-proc-pid">PROCESS ID (OPTIONAL)</label>
            <input id="comp-proc-pid" name="pid" type="number" min="1" step="1" placeholder="Auto-assigned if blank">
          </div>
          <div class="form-field">
            <label for="comp-proc-priority">PRIORITY (OPTIONAL)</label>
            <select id="comp-proc-priority" name="priority">
              <option value="1">Priority 1 (High)</option>
              <option value="2" selected>Priority 2 (Normal)</option>
              <option value="3">Priority 3 (Medium)</option>
              <option value="4">Priority 4 (Low)</option>
              <option value="5">Priority 5 (Background)</option>
            </select>
          </div>
        </div>
        <div class="form-buttons">
          <button class="button button-primary" type="submit">Enqueue to All Simulators</button>
          <button class="button cancel-add-button" id="comp-cancel-add-btn" type="button">Cancel</button>
        </div>
      </form>

      <!-- Shared Release Process Modal / Form -->
      <div class="comp-release-panel hidden" id="comp-release-panel">
        <div class="form-title">
          <strong>Release Process from All Simulators</strong>
          <small>Deallocates the process from all four arenas and merges adjacent free blocks separately</small>
        </div>
        <div class="comp-release-controls">
          <select id="comp-release-select" aria-label="Select process to release">
            <!-- Populated dynamically with active process IDs -->
          </select>
          <button class="button button-primary" id="comp-confirm-release-btn" type="button">Release from All 4</button>
          <button class="button button-outline" id="comp-cancel-release-btn" type="button">Cancel</button>
        </div>
      </div>

      <!-- Shared Pending Queue Strip -->
      <section class="panel comp-queue-strip" aria-labelledby="comp-queue-title">
        <div class="comp-queue-strip-header">
          <div class="comp-queue-title-wrap">
            <span class="section-kicker">SHARED PROCESS QUEUE</span>
            <h3 id="comp-queue-title">Pending Allocations <span class="queue-count" id="comp-queue-count">1</span></h3>
          </div>
          <div class="comp-queue-strip-desc">Processes in this queue will be evaluated by all four algorithms simultaneously.</div>
        </div>
        <div class="comp-queue-chips" id="comp-queue-chips">
          <!-- Populated dynamically -->
        </div>
      </section>

      <!-- Four Independent Simulators Grid (2x2) -->
      <div class="simulators-grid" id="simulators-grid">
        <!-- Rendered dynamically for First Fit, Best Fit, Worst Fit, Next Fit -->
      </div>

      <!-- Live Comparison Matrix Table -->
      <section class="panel comparison-matrix-panel" aria-labelledby="comparison-matrix-title">
        <div class="panel-heading">
          <div>
            <div class="section-kicker">REAL-TIME COMPARISON MATRIX</div>
            <h2 id="comparison-matrix-title">Dynamic Side-by-Side Algorithm Performance</h2>
          </div>
          <span class="heading-chip" id="comp-matrix-status-chip">Live Synchronized</span>
        </div>
        <div class="comparison-table-wrap">
          <table class="comparison-table full-matrix-table">
            <thead>
              <tr>
                <th style="width: 13%;">ALGORITHM</th>
                <th style="width: 25%;">RECENT BLOCK SELECTION & OFFSET</th>
                <th style="width: 12%;">ALLOCATED</th>
                <th style="width: 12%;">FREE MEMORY</th>
                <th style="width: 14%;">LARGEST FREE BLOCK</th>
                <th style="width: 14%;">EXT. FRAGMENTATION</th>
                <th style="width: 10%;">SUCCESS / FAILED</th>
              </tr>
            </thead>
            <tbody id="comparison-matrix-body">
              <!-- Populated dynamically -->
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
}
