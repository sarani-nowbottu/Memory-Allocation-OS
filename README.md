# MemCraft – Operating System Memory Management Simulator

MemCraft is a complete, interactive, and educational browser simulator for Operating System Contiguous Memory Management. It visually demonstrates how an OS partitions memory, assigns space to processes using classic allocation strategies, merges adjacent free blocks upon deallocation, and analyzes external fragmentation.

## Key Features

- **5 Dedicated Navigable Pages**:
  1. **Overview**: Conceptual foundation of memory management, allocation/deallocation lifecycle, detailed analysis of the four strategies, and interactive walkthrough.
  2. **Memory Simulator**: Interactive 1,024 MB arena with proportional graphical SVG blocks, real-time statistics (Allocated, Free, Largest Block, External Fragmentation), dynamic block table, next-fit pointer tracking, and clickable deallocation.
  3. **Process Queue**: Queue management with custom process ID (auto or manual), memory requirements (1–1,024 MB), priority levels (1–5), job deletion, and sequential "Allocate next" and "Run queue" controls.
  4. **Algorithm Comparison**: Real-time side-by-side 2x2 multi-simulator suite running First Fit, Best Fit, Worst Fit, and Next Fit simultaneously on independent memory states with a shared process queue, synchronized allocation stepping, deallocation coalescing across all four simulators, and a live performance comparison matrix.
  5. **Activity Log**: Chronological audit trail with filter tabs (Allocations, Releases, Merges, Blocked attempts, System events), search by PID/keyword, timestamps, and log reset.
- **Accurate Placement Logic**: Real implementations of First Fit, Next Fit, Best Fit, and Worst Fit.
- **Contiguous Block Merging (Coalescing)**: Contiguous free blocks automatically merge after deallocation.
- **Zero External Dependencies**: Pure vanilla JavaScript (ES modules), CSS, and HTML with native Node.js test runner.

## Run Locally

Node.js 18 or newer is required. From the project root:

```sh
npm start
```

Open `http://127.0.0.1:4173` in any modern web browser.

Run all algorithm and process management unit tests with:

```sh
npm test
```

## Project Layout

```text
index.html                 App shell, sidebar navigation, and layout container
server.js                  Dependency-free local HTTP development server
src/
  main.js                  Page mounting and application bootstrap
  navigation.js            Client-side hash routing and active state
  process-manager.js       Reactive state management (blocks, queue, coalescing, logs)
  simulator.js             Memory arena SVG, stats, and simulator controls
  process-queue.js         Queue management and sequential execution controls
  comparison.js            Side-by-side algorithm comparison controller
  activity-log.js          Audit trail controller with filters and search
  algorithms/
    memory-allocation.js   First Fit, Next Fit, Best Fit, Worst Fit, split, coalesce, & frag
  pages/
    overview.js            Page 1: Overview template
    simulator.js           Page 2: Memory Simulator template
    process-queue.js       Page 3: Process Queue template
    comparison.js          Page 4: Algorithm Comparison template
    activity-log.js        Page 5: Activity Log template
  styles/
    shared.css             Shared design tokens, buttons, banners, and sidebar icons
    overview.css           Overview hub cards, policy cards, and walkthrough
    simulator.css          Memory map diagram and block table styles
    process-queue.css      Queue cards, add process form, and action cells
    comparison.css         Comparison cards, mini arena bars, and matrix table
    activity-log.css       Event audit table, badges, and filter tabs
    responsive.css         Cross-page responsive breakpoints
  utils/
    feedback.js            Toast notifications
tests/
  memory-allocation.test.js Comprehensive test suite (11 unit tests)
```
