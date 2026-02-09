(function () {
  var STORAGE_KEY = "theme-preference";
  var root = document.documentElement;
  var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function getStoredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  }

  function getSystemTheme() {
    return mediaQuery.matches ? "dark" : "light";
  }

  function getResolvedTheme() {
    return getStoredTheme() || getSystemTheme();
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  }

  function updateButton(button, resolvedTheme, storedTheme) {
    var nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    button.textContent = resolvedTheme === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", "Switch to " + nextTheme + " mode");
    button.title = storedTheme
      ? "Theme: " + storedTheme + " (click to switch)"
      : "Theme: system default (click to override)";
  }

  function mountToggle() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.setAttribute("aria-live", "polite");
    document.body.appendChild(button);

    function refresh() {
      var storedTheme = getStoredTheme();
      var resolvedTheme = getResolvedTheme();
      applyTheme(resolvedTheme);
      updateButton(button, resolvedTheme, storedTheme);
    }

    button.addEventListener("click", function () {
      var current = getResolvedTheme();
      var next = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      refresh();
    });

    var handleSystemThemeChange = function () {
      if (!getStoredTheme()) {
        refresh();
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();
