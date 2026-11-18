import test from "node:test";
import assert from "node:assert/strict";
import { ProcessManager, STORAGE_KEY } from "../src/process-manager.js";

// Helper mock for localStorage
function createMockLocalStorage(initialStore = {}) {
  const store = { ...initialStore };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    _getStore: () => store
  };
}

test("State Persistence 1: First browser launch without saved state starts with clean 1,024 MB arena (no automatic demo processes)", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    const manager = new ProcessManager();
    const stats = manager.getStats();

    // Must start clean without sample data
    assert.equal(stats.allocatedMemory, 0);
    assert.equal(stats.allocatedCount, 0);
    assert.equal(stats.freeMemory, 1024);
    assert.equal(stats.freeCount, 1);
    assert.equal(stats.queueCount, 0);
    assert.equal(manager.queue.length, 0);
    assert.equal(manager.blocks.length, 1);
    assert.equal(manager.blocks[0].pid, null);

    // Initial clean state must be saved to storage
    assert.ok(mockStorage.getItem(STORAGE_KEY));
    const saved = JSON.parse(mockStorage.getItem(STORAGE_KEY));
    assert.equal(saved.blocks.length, 1);
    assert.equal(saved.blocks[0].pid, null);
    assert.equal(saved.queue.length, 0);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 2: Allocations, enqueues, and policy persist across browser refresh", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    // 1. Initial clean session
    const session1 = new ProcessManager();
    session1.setPolicy("best");
    session1.enqueueProcess(200, 10);
    session1.enqueueProcess(150, 11);

    assert.equal(session1.queue.length, 2);

    // Allocate first process P10 (200 MB)
    const allocRes = session1.allocateNext();
    assert.equal(allocRes.success, true);
    assert.equal(session1.getStats().allocatedMemory, 200);
    assert.equal(session1.getStats().freeMemory, 824);
    assert.equal(session1.queue.length, 1);

    // 2. Simulate browser refresh by creating a new ProcessManager instance
    const session2 = new ProcessManager();
    const stats2 = session2.getStats();

    assert.equal(stats2.allocatedMemory, 200);
    assert.equal(stats2.freeMemory, 824);
    assert.equal(stats2.allocatedCount, 1);
    assert.equal(stats2.queueCount, 1);
    assert.equal(session2.policy, "best");
    assert.equal(session2.blocks.find(b => b.pid === 10).size, 200);
    assert.equal(session2.queue[0].pid, 11);
    assert.equal(session2.queue[0].size, 150);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 3: Releasing all processes leaves 0 MB allocated and persists across refresh", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    const session1 = new ProcessManager();
    session1.enqueueProcess(300, 1);
    session1.enqueueProcess(200, 2);
    session1.allocateNext("first");
    session1.allocateNext("first");

    assert.equal(session1.getStats().allocatedMemory, 500);

    // Release all processes
    session1.release(1);
    assert.equal(session1.getStats().allocatedMemory, 200);

    session1.release(2);
    assert.equal(session1.getStats().allocatedMemory, 0);
    assert.equal(session1.getStats().freeMemory, 1024);
    assert.equal(session1.blocks.length, 1);
    assert.equal(session1.blocks[0].pid, null);

    // Simulate browser refresh: must restore 0 MB allocated, no processes reappear!
    const session2 = new ProcessManager();
    assert.equal(session2.getStats().allocatedMemory, 0);
    assert.equal(session2.getStats().freeMemory, 1024);
    assert.equal(session2.getStats().allocatedCount, 0);
    assert.equal(session2.blocks.length, 1);
    assert.equal(session2.blocks[0].pid, null);
    assert.equal(session2.queue.length, 0);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 4: Reset Simulator clears all state and persists clean slate", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    const session1 = new ProcessManager();
    // Load example layout explicitly
    session1.resetToExample();
    assert.equal(session1.getStats().allocatedMemory, 192);
    assert.equal(session1.queue.length, 3);

    // Reset simulator to clean state
    session1.resetSimulator();
    assert.equal(session1.getStats().allocatedMemory, 0);
    assert.equal(session1.getStats().freeMemory, 1024);
    assert.equal(session1.queue.length, 0);
    assert.equal(session1.pointer, 0);

    // Simulate closing and reopening browser
    const session2 = new ProcessManager();
    assert.equal(session2.getStats().allocatedMemory, 0);
    assert.equal(session2.getStats().freeMemory, 1024);
    assert.equal(session2.queue.length, 0);
    assert.equal(session2.blocks.length, 1);
    assert.equal(session2.blocks[0].pid, null);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 5: Explicitly loading example layout persists across refresh", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    const session1 = new ProcessManager();
    assert.equal(session1.getStats().allocatedMemory, 0);

    // User explicitly loads example layout
    session1.resetToExample();
    assert.equal(session1.getStats().allocatedMemory, 192);
    assert.equal(session1.queue.length, 3);

    // Refresh browser: example layout remains because user explicitly chose it
    const session2 = new ProcessManager();
    assert.equal(session2.getStats().allocatedMemory, 192);
    assert.equal(session2.queue.length, 3);
    assert.equal(session2.blocks.length, 7);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 6: Corrupted or invalid localStorage handled safely", () => {
  const mockStorage = createMockLocalStorage({
    [STORAGE_KEY]: "{ invalid json &*!@#"
  });
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    // Should safely fallback to clean 1,024 MB without crashing
    const manager = new ProcessManager();
    assert.equal(manager.getStats().allocatedMemory, 0);
    assert.equal(manager.getStats().freeMemory, 1024);
    assert.equal(manager.queue.length, 0);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});

test("State Persistence 7: Reset updates both localStorage and sessionStorage", () => {
  const localStore = createMockLocalStorage();
  const sessionStore = createMockLocalStorage();
  globalThis.localStorage = localStore;
  globalThis.sessionStorage = sessionStore;
  globalThis.window = {};

  try {
    const manager = new ProcessManager();
    manager.resetSimulator();

    // Verify both storage sources are updated with clean state
    assert.ok(localStore.getItem(STORAGE_KEY));
    assert.ok(sessionStore.getItem(STORAGE_KEY));

    const localData = JSON.parse(localStore.getItem(STORAGE_KEY));
    const sessionData = JSON.parse(sessionStore.getItem(STORAGE_KEY));

    assert.equal(localData.blocks.length, 1);
    assert.equal(localData.blocks[0].pid, null);
    assert.equal(sessionData.blocks.length, 1);
    assert.equal(sessionData.blocks[0].pid, null);

    // Verify fallback to sessionStorage if localStorage is cleared
    localStore.clear();
    const fallbackManager = new ProcessManager();
    assert.equal(fallbackManager.getStats().allocatedMemory, 0);
    assert.equal(fallbackManager.getStats().freeMemory, 1024);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    delete globalThis.window;
  }
});

test("State Persistence 8: The four algorithms (First Fit, Best Fit, Worst Fit, Next Fit) reflect cleared state on refresh", () => {
  const mockStorage = createMockLocalStorage();
  globalThis.localStorage = mockStorage;
  globalThis.window = {};

  try {
    // Setup clean reset
    const manager = new ProcessManager();
    manager.resetTo1024();

    // Verify simulation state has 0 MB allocated
    assert.equal(manager.getStats().allocatedMemory, 0);
    assert.equal(manager.queue.length, 0);

    // Verify each of the four algorithms starting from this restored state has 0 MB allocated
    const policies = ["first", "best", "worst", "next"];
    for (const policy of policies) {
      const activeBlocks = manager.blocks.filter(b => b.pid !== null);
      const allocated = activeBlocks.reduce((sum, b) => sum + b.size, 0);
      assert.equal(allocated, 0, `${policy} must reflect 0 MB allocated`);
      assert.equal(manager.blocks[0].size, 1024);
      assert.equal(manager.blocks[0].pid, null);
    }

    // Verify P5, P6, P7 are not present in blocks or queue
    const allPids = [
      ...manager.blocks.filter(b => b.pid !== null).map(b => b.pid),
      ...manager.queue.map(p => p.pid)
    ];
    assert.ok(!allPids.includes(5), "P5 must not reappear");
    assert.ok(!allPids.includes(6), "P6 must not reappear");
    assert.ok(!allPids.includes(7), "P7 must not reappear");
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});
