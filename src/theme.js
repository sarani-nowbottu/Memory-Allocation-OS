const THEME_STORAGE_KEY = "memlab-theme";

/**
 * Get preferred theme from storage or system preferences.
 * @returns {"light" | "dark"}
 */
export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      return saved;
    }
  } catch {
    // localStorage might be unavailable in sandboxed environments
  }

  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Apply the theme to the document and synchronize toggle button state.
 * @param {"light" | "dark"} theme
 */
export function applyTheme(theme) {
  const isDark = theme === "dark";
  const targetTheme = isDark ? "dark" : "light";

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", targetTheme);
    if (document.body) {
      document.body.setAttribute("data-theme", targetTheme);
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", isDark ? "#0e171b" : "#f5f7fb");
    }

    const toggleBtn = document.querySelector("#theme-toggle");
    const label = document.querySelector("#theme-label");

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-checked", isDark ? "true" : "false");
      toggleBtn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    }

    if (label) {
      label.textContent = isDark ? "Dark" : "Light";
    }
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, targetTheme);
  } catch {
    // Ignore storage write issues
  }

  return targetTheme;
}

/**
 * Toggle between dark and light mode.
 * @returns {"light" | "dark"}
 */
export function toggleTheme() {
  const current = typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") || "light"
    : "light";
  const next = current === "dark" ? "light" : "dark";
  return applyTheme(next);
}

/**
 * Initialize theme and event listeners.
 */
export function initializeTheme() {
  const initialTheme = getStoredTheme();
  applyTheme(initialTheme);

  const toggleBtn = document.querySelector("#theme-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      toggleTheme();
    });
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      try {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          applyTheme(e.matches ? "dark" : "light");
        }
      } catch {
        applyTheme(e.matches ? "dark" : "light");
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }
  }
}
