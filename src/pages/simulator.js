export function renderSimulatorPage() {
  return `
    <div class="simulator-page">
    <section class="page-heading">
      <div>
        <div class="eyebrow"><span class="eyebrow-line"></span> MEMORY MANAGEMENT LAB</div>
        <h1>Memory Simulator</h1>
        <p class="subtitle">Explore how allocation strategies place processes in a fragmented memory arena, compact memory to eliminate external fragmentation, release memory to trigger coalescing, and track real-time memory metrics.</p>
      </div>
      <div class="heading-actions">
        <a class="button button-outline" href="#comparison"><span class="compare-icon">⚖</span> Full Comparison Page</a>
        <button class="button button-outline" id="reset-clean-button" type="button"><span class="reset-icon">↺</span> Reset to 1,024 MB Clean</button>
        <button class="button button-quiet" id="reset-button" type="button"><span class="reset-icon">↻</span> Load Example Layout</button>
      </div>
    </section>

    <!-- Operation Feedback Banner -->
    <div class="feedback-banner hidden" id="simulator-feedback-banner" role="status" aria-live="polite">
      <span class="feedback-icon" id="simulator-feedback-icon">ℹ</span>
      <div class="feedback-text" id="simulator-feedback-text">Ready to allocate waiting processes.</div>
    </div>

    <section class="control-panel" aria-label="Simulation controls">
      <div class="policy-control">
        <label for="policy-select">ALLOCATION POLICY</label>
        <div class="select-wrap">
          <select id="policy-select">
            <option value="first">First Fit</option>
            <option value="next">Next Fit</option>
            <option value="best">Best Fit</option>
            <option value="worst">Worst Fit</option>
          </select>
          <span class="select-chevron"></span>
        </div>
      </div>
      <div class="control-divider"></div>
      <div class="arena-control"><span class="control-label">MEMORY ARENA</span><strong>1,024 <span>MB</span></strong></div>
      <div class="control-divider"></div>
      <div class="next-fit-control"><span class="control-label">NEXT-FIT POINTER</span><strong id="pointer-value">0 <span>MB</span></strong></div>
      <div class="control-actions">
        <button class="button button-outline" id="step-button" type="button"><span class="step-icon">›</span> Allocate next</button>
        <button class="button button-primary" id="run-button" type="button"><span class="play-icon">▶</span> Run queue</button>
        <button class="button button-outline" id="compact-button" type="button"><span class="compact-icon">⇊</span> Compact memory</button>
        <button class="button button-outline" id="compare-button" type="button">Quick preview</button>
      </div>
    </section>

    <!-- Before-and-After Memory Compaction Panel -->
    <section class="panel compaction-panel" id="compaction-panel" hidden aria-labelledby="compaction-title">
      <div class="panel-heading">
        <div>
          <div class="section-kicker">MEMORY DEFRAGMENTATION (COMPACTION)</div>
          <h2 id="compaction-title">Compaction Results: Before vs After <span class="heading-chip">External Fragmentation Eliminated</span></h2>
        </div>
        <button class="icon-button" id="close-compaction-button" type="button" aria-label="Close compaction report" title="Close compaction report">×</button>
      </div>
      <div class="compaction-content" id="compaction-content"></div>
    </section>

    <section class="panel comparison-panel" id="comparison-panel" hidden aria-labelledby="comparison-title">
      <div class="panel-heading">
        <div><div class="section-kicker">SIDE-BY-SIDE PREVIEW</div><h2 id="comparison-title">Quick Policy Comparison <span class="heading-chip">does not change live memory</span></h2></div>
        <button class="icon-button" id="close-comparison-button" type="button" aria-label="Close policy comparison" title="Close comparison">×</button>
      </div>
      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead><tr><th>POLICY</th><th>PROCESS PLACEMENTS</th><th>UNPLACED</th><th>LARGEST FREE</th><th>EXT. FRAG.</th></tr></thead>
          <tbody id="comparison-table-body"></tbody>
        </table>
      </div>
    </section>

    <section class="stats-grid simulator-stats-grid" aria-label="Memory statistics">
      <article class="stat-card">
        <div class="stat-top"><span class="stat-label">TOTAL MEMORY</span><span class="stat-symbol total-symbol">M</span></div>
        <div class="stat-value">1,024 <span>MB</span></div>
        <div class="stat-foot">Physical space available</div>
      </article>
      <article class="stat-card">
        <div class="stat-top"><span class="stat-label">ALLOCATED</span><span class="stat-symbol alloc-symbol"><i></i></span></div>
        <div class="stat-value" id="allocated-value">0 <span>MB</span></div>
        <div class="stat-foot"><span class="foot-dot allocated-dot"></span><span id="allocated-count">0</span> processes active</div>
      </article>
      <article class="stat-card">
        <div class="stat-top"><span class="stat-label">FREE MEMORY</span><span class="stat-symbol free-symbol">↗</span></div>
        <div class="stat-value" id="free-value">1,024 <span>MB</span></div>
        <div class="stat-foot">Across <span id="free-count">1</span> available blocks</div>
      </article>
      <article class="stat-card">
        <div class="stat-top"><span class="stat-label">LARGEST FREE BLOCK</span><span class="stat-symbol largest-symbol">⌗</span></div>
        <div class="stat-value" id="largest-value">1,024 <span>MB</span></div>
        <div class="stat-foot">Max contiguous segment</div>
      </article>
      <article class="stat-card">
        <div class="stat-top"><span class="stat-label">EXTERNAL FRAGMENTATION</span><span class="stat-symbol frag-symbol">◫</span></div>
        <div class="stat-value" id="frag-value">0 <span>MB</span></div>
        <div class="stat-foot"><span id="frag-rate">0.0%</span> of free space fragmented</div>
      </article>
    </section>

    <section class="panel memory-panel" aria-labelledby="memory-title">
      <div class="panel-heading">
        <div><div class="section-kicker">LIVE MEMORY MAP</div><h2 id="memory-title">Memory Arena Layout <span class="heading-chip">1,024 MB</span></h2></div>
        <div class="legend">
          <span><i class="legend-swatch free-swatch"></i> Free memory</span>
          <span><i class="legend-swatch allocated-swatch"></i> Allocated process</span>
          <span class="pointer-legend"><i></i> Next-fit pointer</span>
        </div>
      </div>
      <div class="map-guide">
        <span class="guide-icon">i</span>
        <span><strong>How to read this map:</strong> Memory blocks are stacked by physical address. Taller blocks represent larger allocations. Low addresses are at the bottom (0 MB); high addresses are at the top (1,024 MB). Click on any allocated block (green) to release it.</span>
      </div>
      <div class="arena-wrap">
        <div class="memory-visual-scroll">
          <svg class="memory-visual" id="memory-arena" viewBox="0 0 760 480" role="img" aria-label="Memory layout diagram"></svg>
        </div>
      </div>
      <div class="block-table-wrap">
        <table class="block-table">
          <thead><tr><th>BLOCK</th><th>OFFSET</th><th>SIZE</th><th>STATUS</th><th>PROCESS</th><th>ACTION</th></tr></thead>
          <tbody id="block-table-body"></tbody>
        </table>
      </div>
      <div class="panel-footnote">
        <span class="info-mark">i</span> Click an allocated block above or use its table Release action to free memory and trigger adjacent free block coalescing. Use <b>Compact memory</b> to pack processes and unite scattered free holes.
      </div>
    </section>
    </div>`;
}
