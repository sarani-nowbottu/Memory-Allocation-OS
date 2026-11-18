export function renderProcessQueuePage() {
  return `
    <div class="queue-page">
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> PROCESS MANAGEMENT</div>
          <h1>Process Queue</h1>
          <p class="subtitle">Review waiting memory requests, add custom processes with priority, remove queued jobs, and execute sequential allocations.</p>
        </div>
        <div class="heading-actions">
          <button class="button button-outline" id="queue-reset-clean-button" type="button"><span class="reset-icon">↺</span> Reset to 1,024 MB Clean</button>
          <button class="button button-quiet" id="queue-reset-example-button" type="button"><span class="reset-icon">↻</span> Load Example Layout</button>
          <a class="button button-outline" href="#simulator">View Live Simulator ↗</a>
          <a class="button button-outline" href="#activity">Full Activity Log ↗</a>
        </div>
      </div>

      <!-- Queue Feedback Banner -->
      <div class="feedback-banner hidden" id="queue-feedback-banner" role="status" aria-live="polite">
        <span class="feedback-icon" id="queue-feedback-icon">ℹ</span>
        <div class="feedback-text" id="queue-feedback-text">Ready to manage process queue.</div>
      </div>

      <!-- Queue KPI Metrics -->
      <div class="stats-grid queue-stats-grid" aria-label="Queue statistics">
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">QUEUED PROCESSES</span><span class="stat-symbol queue-count-symbol">#</span></div>
          <div class="stat-value" id="queue-count-stat">0</div>
          <div class="stat-foot">Jobs waiting for allocation</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">TOTAL MEMORY DEMAND</span><span class="stat-symbol total-symbol">Σ</span></div>
          <div class="stat-value" id="queue-demand-stat">0 <span>MB</span></div>
          <div class="stat-foot">Cumulative pending requests</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">NEXT IN LINE</span><span class="stat-symbol alloc-symbol"><i></i></span></div>
          <div class="stat-value" id="queue-head-stat">None <span>(Queue empty)</span></div>
          <div class="stat-foot">Head of the FIFO queue</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-label">ACTIVE STRATEGY</span><span class="stat-symbol free-symbol">⚙</span></div>
          <div class="stat-value" id="queue-policy-stat">First Fit</div>
          <div class="stat-foot">Allocation rule applied</div>
        </article>
      </div>

      <!-- Queue Actions Bar -->
      <section class="control-panel queue-control-panel" aria-label="Process queue controls">
        <div class="policy-control">
          <label for="queue-policy-select">ALLOCATION POLICY</label>
          <div class="select-wrap">
            <select id="queue-policy-select">
              <option value="first">First Fit</option>
              <option value="next">Next Fit</option>
              <option value="best">Best Fit</option>
              <option value="worst">Worst Fit</option>
            </select>
            <span class="select-chevron"></span>
          </div>
        </div>
        <div class="control-divider"></div>
        <div class="control-actions queue-control-actions">
          <button class="button button-outline" id="queue-step-button" type="button"><span class="step-icon">›</span> Allocate next</button>
          <button class="button button-primary" id="queue-run-button" type="button"><span class="play-icon">▶</span> Run queue</button>
          <button class="button button-outline" id="queue-compact-button" type="button"><span class="compact-icon">⇊</span> Compact memory</button>
          <button class="button button-outline" id="add-process-button" type="button"><span>+</span> Add Process</button>
        </div>
      </section>

      <!-- Add Process Modal / Form Card -->
      <form class="add-process-form hidden" id="add-process-form" aria-label="Add new process form">
        <div class="form-title">
          <strong>Add New Process Request</strong>
          <small>Specify memory size, custom PID (optional), and priority level</small>
        </div>
        <div class="add-process-grid">
          <div class="form-field">
            <label for="process-size">MEMORY SIZE (MB) *</label>
            <input id="process-size" name="size" type="number" min="1" max="1024" step="1" value="64" required placeholder="e.g. 128">
          </div>
          <div class="form-field">
            <label for="process-pid">PROCESS ID (OPTIONAL)</label>
            <input id="process-pid" name="pid" type="number" min="1" step="1" placeholder="Auto-assigned if blank">
          </div>
          <div class="form-field">
            <label for="process-priority">PRIORITY (OPTIONAL)</label>
            <select id="process-priority" name="priority">
              <option value="1">Priority 1 (High)</option>
              <option value="2" selected>Priority 2 (Normal)</option>
              <option value="3">Priority 3 (Medium)</option>
              <option value="4">Priority 4 (Low)</option>
              <option value="5">Priority 5 (Background)</option>
            </select>
          </div>
        </div>
        <div class="form-buttons">
          <button class="button button-primary" type="submit">Enqueue Process</button>
          <button class="button cancel-add-button" id="cancel-add-button" type="button">Cancel</button>
        </div>
      </form>

      <!-- Queue Layout Grid -->
      <div class="lower-grid queue-page-grid">
        <section class="panel queue-panel" aria-labelledby="queue-title">
          <div class="panel-heading queue-heading">
            <div>
              <div class="section-kicker">WAITING FOR ALLOCATION</div>
              <h2 id="queue-title">Pending Process Queue <span class="queue-count" id="queue-count">0</span></h2>
            </div>
            <span class="queue-note">Processed in First-Come, First-Served order</span>
          </div>

          <div class="queue-list" id="queue-list"></div>
          <div class="queue-empty hidden" id="queue-empty" hidden>
            <div class="empty-state-icon">✓</div>
            <strong>Queue is empty</strong>
            <p>All waiting processes have been placed in memory or no jobs are pending. Use "+ Add Process" to create a new request.</p>
          </div>
        </section>

        <!-- Compact Recent Activity Preview -->
        <section class="panel activity-panel" aria-labelledby="activity-preview-title">
          <div class="panel-heading activity-heading">
            <div>
              <div class="section-kicker">RECENT EVENTS</div>
              <h2 id="activity-preview-title">Recent Activity Log</h2>
            </div>
            <a class="overview-link" href="#activity">View All Events <span>→</span></a>
          </div>
          <div class="activity-list" id="activity-list" aria-live="polite"></div>
          <div class="panel-footer-actions">
            <button class="text-button" id="clear-log-button" type="button">Clear Log</button>
          </div>
        </section>
      </div>
    </div>`;
}
