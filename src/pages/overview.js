export function renderOverviewPage() {
  return `
    <section class="overview-section overview-page" aria-labelledby="overview-title">
      <div class="overview-intro">
        <div class="eyebrow"><span class="eyebrow-line"></span> OPERATING SYSTEM MEMORY MANAGEMENT</div>
        <h1 id="overview-title">Interactive Memory Allocation Simulator</h1>
        <p class="subtitle">An educational simulation demonstrating how operating systems partition physical memory, allocate space for active processes, deallocate completed tasks, and coalesce contiguous free memory blocks.</p>
      </div>

      <!-- Live Simulation State Banner -->
      <div class="overview-live-state" aria-label="Live simulation status">
        <div class="live-state-header">
          <div class="live-state-title">
            <span class="live-pulse"></span>
            <strong>CENTRALIZED SIMULATION STATE</strong>
            <span class="sync-tag">Live Synchronized</span>
          </div>
          <div class="live-state-actions">
            <button class="button button-outline" id="overview-reset-clean-btn" type="button"><span>↺</span> Reset to 1,024 MB Clean</button>
            <button class="button button-quiet" id="overview-reset-example-btn" type="button"><span>↻</span> Load Example Layout</button>
          </div>
        </div>
        <div class="live-state-grid">
          <div class="live-state-card">
            <small>ACTIVE STRATEGY</small>
            <strong id="overview-active-policy">First Fit</strong>
            <span id="overview-policy-note">Fastest sequential search</span>
          </div>
          <div class="live-state-card">
            <small>ALLOCATED MEMORY</small>
            <strong id="overview-allocated-mem">0 MB</strong>
            <span id="overview-allocated-count">0 processes active</span>
          </div>
          <div class="live-state-card">
            <small>FREE MEMORY</small>
            <strong id="overview-free-mem">1,024 MB</strong>
            <span id="overview-free-count">1 contiguous block</span>
          </div>
          <div class="live-state-card">
            <small>WAITING QUEUE</small>
            <strong id="overview-queue-count">0 processes</strong>
            <span id="overview-queue-demand">0 MB total demand</span>
          </div>
        </div>
      </div>

      <!-- Quick Navigation Hub -->
      <div class="overview-hub" aria-label="Quick navigation to simulator sections">
        <a class="hub-card" href="#simulator">
          <div class="hub-header">
            <span class="hub-icon memory-hub-icon">▥</span>
            <span class="hub-badge">Interactive Map</span>
          </div>
          <h3>Memory Simulator</h3>
          <p>Visualize the 1,024 MB arena in real-time, step through allocations, and release processes.</p>
          <span class="hub-link">Open simulator →</span>
        </a>
        <a class="hub-card" href="#queue">
          <div class="hub-header">
            <span class="hub-icon queue-hub-icon">☰</span>
            <span class="hub-badge">Process Control</span>
          </div>
          <h3>Process Queue</h3>
          <p>Add custom requests with process ID and priority, remove jobs, and run queue sequentially.</p>
          <span class="hub-link">Manage queue →</span>
        </a>
        <a class="hub-card" href="#comparison">
          <div class="hub-header">
            <span class="hub-icon compare-hub-icon">⚖</span>
            <span class="hub-badge">Benchmark</span>
          </div>
          <h3>Algorithm Comparison</h3>
          <p>Compare First Fit, Next Fit, Best Fit, and Worst Fit side-by-side with fragmentation metrics.</p>
          <span class="hub-link">Compare policies →</span>
        </a>
        <a class="hub-card" href="#activity">
          <div class="hub-header">
            <span class="hub-icon log-hub-icon">◷</span>
            <span class="hub-badge">Event Audit</span>
          </div>
          <h3>Activity Log</h3>
          <p>Audit memory allocations, releases, block coalescing events, and blocked attempts.</p>
          <span class="hub-link">View log →</span>
        </a>
      </div>

      <!-- Core Concepts Grid -->
      <div class="overview-grid">
        <article class="overview-card">
          <span class="overview-card-icon">⇄</span>
          <div>
            <h2>Dynamic Partitioning & Coalescing</h2>
            <p>When a process requests memory, a free block of sufficient size is split: the requested amount is assigned to the process, and any remaining portion forms a new smaller free block. When memory is freed, adjacent free blocks are automatically merged (coalesced) into larger contiguous regions to combat external fragmentation.</p>
          </div>
        </article>

        <article class="overview-card">
          <span class="overview-card-icon">⇊</span>
          <div>
            <h2>External Fragmentation & Compaction</h2>
            <p>External fragmentation occurs when total free space is sufficient for a request (e.g. 388 MB free), but memory is scattered in smaller holes (e.g. largest hole is 160 or 192 MB). Memory Compaction relocates all active processes contiguously, uniting all free holes into a single large contiguous block.</p>
          </div>
        </article>
      </div>

      <!-- Quick Start Steps -->
      <article class="overview-steps">
        <div class="overview-steps-heading">
          <div><div class="section-kicker">INTERACTIVE WALKTHROUGH</div><h2>How to Use This Simulator</h2></div>
          <a class="overview-link" href="#simulator">Launch simulator <span>→</span></a>
        </div>
        <ol class="steps-list">
          <li>
            <span class="step-number">01</span>
            <div>
              <strong>Explore the Starting Arena</strong>
              <p>Navigate to <b>Memory Simulator</b> to view the proportional 1,024 MB arena diagram, active process blocks, and address ruler.</p>
            </div>
          </li>
          <li>
            <span class="step-number">02</span>
            <div>
              <strong>Select Policy & Allocate Processes</strong>
              <p>Choose an algorithm, then click <b>Allocate next</b> for step-by-step placement or <b>Run queue</b> for automatic sequential execution.</p>
            </div>
          </li>
          <li>
            <span class="step-number">03</span>
            <div>
              <strong>Deallocate & Observe Coalescing</strong>
              <p>Click on any allocated block in the diagram or click <b>Release</b> in the table to free memory and watch adjacent free blocks merge instantly.</p>
            </div>
          </li>
          <li>
            <span class="step-number">04</span>
            <div>
              <strong>Benchmark on the Comparison Page</strong>
              <p>Switch to <b>Algorithm Comparison</b> to compare how all four algorithms perform on identical workloads, tracking fragmentation and placement efficiency.</p>
            </div>
          </li>
        </ol>
        <p class="overview-note"><span>Educational Notice</span> This software is a simulated conceptual model for Operating Systems education. It illustrates memory allocation logic and contiguous partitioning without interacting with physical machine hardware or real OS kernel memory.</p>
      </article>
    </section>`;
}
