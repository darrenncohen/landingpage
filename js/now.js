(function () {
  var contentEl = document.getElementById("now-content");

  if (!contentEl) {
    return;
  }

  function showError(message) {
    contentEl.innerHTML = '<p class="error-message" style="display:block;">' + message + "</p>";
  }

  function normalizeLinks() {
    var links = contentEl.querySelectorAll("a");
    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.indexOf("http://") === 0 || href.indexOf("https://") === 0) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
      }
    });
  }

  fetch("content/now.md", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Could not load content/now.md.");
      }
      return response.text();
    })
    .then(function (markdownText) {
      if (!window.marked || typeof window.marked.parse !== "function") {
        throw new Error("Markdown parser unavailable.");
      }

      contentEl.innerHTML = window.marked.parse(markdownText);
      normalizeLinks();
    })
    .catch(function (error) {
      showError("Unable to load now page content. " + error.message);
    });
})();
