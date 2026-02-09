(function () {
  var FEED_ID = "microblog-feed";
  var DATA_PATH = "data/microblog.json";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function renderPost(post) {
    var id = escapeHtml(post.id || "");
    var text = linkifyAndFormat(post.text || "");
    var created = escapeHtml(formatDate(post.createdAt));
    var bluesky = post.blueskyUrl
      ? '<a href="' + escapeHtml(post.blueskyUrl) + '" target="_blank" rel="noopener">Bluesky</a>'
      : "";
    var mastodon = post.mastodonUrl
      ? '<a href="' + escapeHtml(post.mastodonUrl) + '" target="_blank" rel="noopener">Mastodon</a>'
      : "";
    var links = [bluesky, mastodon].filter(Boolean).join(" · ");

    return (
      '<article class="post" id="' +
      id +
      '">' +
      '<div class="post-meta"><span>' +
      created +
      "</span></div>" +
      '<p class="post-blurb">' +
      text +
      "</p>" +
      (links ? '<p class="post-meta">' + links + "</p>" : "") +
      "</article>"
    );
  }

  function linkifyAndFormat(raw) {
    var escaped = escapeHtml(raw || "");
    // Preserve line breaks
    escaped = escaped.replace(/\n/g, "<br>");
    // Linkify URLs
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, function (match) {
      var url = match;
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + "</a>";
    });
  }

  async function loadFeed() {
    var container = document.getElementById(FEED_ID);
    if (!container) return;

    try {
      var response = await fetch(DATA_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed loading posts");
      var posts = await response.json();
      if (!Array.isArray(posts) || posts.length === 0) {
        container.innerHTML = '<p class="loading-message">No posts yet.</p>';
        return;
      }
      container.innerHTML = posts.map(renderPost).join("");
    } catch (err) {
      container.innerHTML = '<p class="error-message" style="display:block;">Could not load posts right now.</p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadFeed);
  } else {
    loadFeed();
  }
})();
