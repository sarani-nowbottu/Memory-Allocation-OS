import test from "node:test";
import assert from "node:assert/strict";
import { getStoredTheme, applyTheme, toggleTheme } from "../src/theme.js";

test("Theme switcher correctly toggles, updates DOM attributes, and persists preferences", () => {
  // Setup mock DOM and storage environment
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const attributes = { doc: {}, body: {} };
  const mockToggleBtn = {
    attributes: {},
    setAttribute(attr, val) { this.attributes[attr] = val; }
  };
  const mockLabel = { textContent: "" };
  const mockMeta = {
    attributes: {},
    setAttribute(attr, val) { this.attributes[attr] = val; }
  };

  globalThis.document = {
    documentElement: {
      setAttribute: (attr, val) => { attributes.doc[attr] = val; },
      getAttribute: (attr) => attributes.doc[attr] || null
    },
    body: {
      setAttribute: (attr, val) => { attributes.body[attr] = val; }
    },
    querySelector: (selector) => {
      if (selector === "#theme-toggle") return mockToggleBtn;
      if (selector === "#theme-label") return mockLabel;
      if (selector === 'meta[name="theme-color"]') return mockMeta;
      return null;
    }
  };

  // Test 1: Default theme is light when nothing is stored
  assert.equal(getStoredTheme(), "light");

  // Test 2: Apply dark theme
  const darkRes = applyTheme("dark");
  assert.equal(darkRes, "dark");
  assert.equal(attributes.doc["data-theme"], "dark");
  assert.equal(attributes.body["data-theme"], "dark");
  assert.equal(store["memlab-theme"], "dark");
  assert.equal(mockToggleBtn.attributes["aria-checked"], "true");
  assert.equal(mockLabel.textContent, "Dark");
  assert.equal(mockMeta.attributes["content"], "#0e171b");

  // Test 3: Toggle theme from dark to light
  const lightRes = toggleTheme();
  assert.equal(lightRes, "light");
  assert.equal(attributes.doc["data-theme"], "light");
  assert.equal(attributes.body["data-theme"], "light");
  assert.equal(store["memlab-theme"], "light");
  assert.equal(mockToggleBtn.attributes["aria-checked"], "false");
  assert.equal(mockLabel.textContent, "Light");
  assert.equal(mockMeta.attributes["content"], "#f5f7fb");

  // Test 4: Toggle theme again from light to dark
  const darkAgain = toggleTheme();
  assert.equal(darkAgain, "dark");
  assert.equal(attributes.doc["data-theme"], "dark");
  assert.equal(store["memlab-theme"], "dark");
  assert.equal(mockLabel.textContent, "Dark");

  // Cleanup globals
  delete globalThis.localStorage;
  delete globalThis.document;
});

test("Dark theme CSS defines high-contrast rules for comparison control text and buttons", async () => {
  const fs = await import("node:fs");
  const css = fs.readFileSync(new URL("../src/styles/theme.css", import.meta.url), "utf8");

  // Verify critical dark mode visibility overrides
  assert.ok(css.includes("#comp-active-scenario-name"));
  assert.ok(css.includes(".comp-control-info strong"));
  assert.ok(css.includes(".control-label"));
  assert.ok(css.includes(".button-outline"));
  assert.ok(css.includes(".sim-pointer-badge"));
  assert.ok(css.includes(".compaction-panel"));
  assert.ok(css.includes(".first-pill"));
  assert.ok(css.includes(".next-pill"));
  assert.ok(css.includes(".best-pill"));
  assert.ok(css.includes(".worst-pill"));
});
