(function () {
  var FEED_ID = "photo-feed";
  var PHOTO_DATA_PATH = "data/photos.json";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(dateStr) {
    if (!dateStr) {
      return "";
    }
    var d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function postMeta(photo) {
    var bits = [];
    var dateLabel = formatDate(photo.takenOn);
    if (dateLabel) bits.push(dateLabel);
    if (photo.location) bits.push(photo.location);
    return bits.join(" · ");
  }

  function postTemplate(photo) {
    var id = escapeHtml(photo.id || "");
    var preferredSrc = escapeHtml(getPrimaryImageUrl(photo));
    var alt = escapeHtml(photo.alt || photo.caption || "Photo");
    var caption = escapeHtml(photo.caption || "");
    var meta = escapeHtml(postMeta(photo));
    var imageMarkup = buildImageMarkup(photo, preferredSrc, alt);

    return (
      '<article class="photo-post" id="' +
      id +
      '">' +
      '<div class="photo-post-header">' +
      '<div class="photo-post-user">' +
      '<img class="photo-post-avatar" src="img/profile_picture.jpg" alt="Darren Cohen avatar">' +
      "<div>" +
      '<p class="photo-post-name">darrencohen</p>' +
      '<p class="photo-post-meta">' +
      meta +
      "</p>" +
      "</div>" +
      "</div>" +
      '<a class="photo-post-anchor" href="#' +
      id +
      '" aria-label="Link to photo post">#</a>' +
      "</div>" +
      '<a class="photo-post-image-link" href="' +
      preferredSrc +
      '" target="_blank" rel="noopener">' +
      imageMarkup +
      "</a>" +
      '<div class="photo-post-actions">' +
      '<button class="photo-icon-button js-share-photo" type="button" data-photo-id="' +
      id +
      '" aria-label="Share this photo">↗</button>' +
      "</div>" +
      '<p class="photo-post-caption"><strong>darrencohen</strong>' +
      caption +
      "</p>" +
      "</article>"
    );
  }

  function getPrimaryImageUrl(photo) {
    var cf = photo.cloudflare || {};
    if (cf.imageId && cf.deliveryHash) {
      var variant = cf.variant || "public";
      return "https://imagedelivery.net/" + cf.deliveryHash + "/" + cf.imageId + "/" + variant;
    }
    return photo.src || "";
  }

  function buildImageMarkup(photo, preferredSrc, alt) {
    var cf = photo.cloudflare || {};
    var hasCloudflare = Boolean(cf.imageId && cf.deliveryHash);
    if (hasCloudflare) {
      return '<img class="photo-post-image" src="' + preferredSrc + '" alt="' + alt + '" loading="lazy">';
    }

    var optimized = photo.optimized || {};
    var base = typeof optimized.base === "string" ? optimized.base : "";
    var widths = Array.isArray(optimized.widths) ? optimized.widths : [];
    var formats = Array.isArray(optimized.formats) ? optimized.formats : [];
    var hasResponsive = base && widths.length > 0 && formats.length > 0;

    if (!hasResponsive) {
      return '<img class="photo-post-image" src="' + preferredSrc + '" alt="' + alt + '" loading="lazy">';
    }

    var sizes = '(max-width: 760px) 100vw, 720px';
    var preferredFormats = ["avif", "webp"];
    var orderedFormats = preferredFormats.filter(function (fmt) {
      return formats.indexOf(fmt) !== -1;
    });
    var otherFormats = formats.filter(function (fmt) {
      return preferredFormats.indexOf(fmt) === -1;
    });

    var sources = orderedFormats
      .concat(otherFormats)
      .map(function (format) {
        var srcset = widths
          .map(function (w) {
            return escapeHtml(base + "-" + w + "." + format) + " " + w + "w";
          })
          .join(", ");
        return '<source type="image/' + escapeHtml(format) + '" srcset="' + srcset + '" sizes="' + sizes + '">';
      })
      .join("");

    return (
      "<picture>" +
      sources +
      '<img class="photo-post-image" src="' +
      preferredSrc +
      '" alt="' +
      alt +
      '" loading="lazy" sizes="' +
      sizes +
      '">' +
      "</picture>"
    );
  }

  function getShareUrl(id) {
    var url = new URL(window.location.href);
    url.hash = id;
    return url.toString();
  }

  function flashShareButton(button, label) {
    var original = button.textContent;
    button.textContent = label;
    window.setTimeout(function () {
      button.textContent = original;
    }, 1000);
  }

  async function copyWithFallback(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {}
    }

    try {
      var input = document.createElement("input");
      input.type = "text";
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      var copied = document.execCommand("copy");
      document.body.removeChild(input);
      return copied;
    } catch (err) {
      return false;
    }
  }

  async function handleShare(event) {
    var button = event.target.closest(".js-share-photo");
    if (!button) {
      return;
    }

    var id = button.getAttribute("data-photo-id");
    if (!id) {
      return;
    }

    var shareUrl = getShareUrl(id);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Photo Stream", url: shareUrl });
        flashShareButton(button, "✓");
        return;
      } catch (err) {}
    }

    var copied = await copyWithFallback(shareUrl);
    if (copied) {
      flashShareButton(button, "✓");
      return;
    }

    window.prompt("Copy this photo link:", shareUrl);
    flashShareButton(button, "↗");
  }

  function highlightHashTarget() {
    var hash = window.location.hash;
    if (!hash) {
      return;
    }
    var target = document.querySelector(hash);
    if (!target) {
      return;
    }
    target.classList.add("is-target");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(function () {
      target.classList.remove("is-target");
    }, 1700);
  }

  async function renderFeed() {
    var feed = document.getElementById(FEED_ID);
    if (!feed) {
      return;
    }

    try {
      var response = await fetch(PHOTO_DATA_PATH, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load photo feed.");
      }
      var photos = await response.json();
      if (!Array.isArray(photos) || photos.length === 0) {
        feed.innerHTML = '<p class="loading-message">No photos yet.</p>';
        return;
      }

      feed.innerHTML = photos.map(postTemplate).join("");
      feed.addEventListener("click", handleShare);
      highlightHashTarget();
      window.addEventListener("hashchange", highlightHashTarget);
    } catch (error) {
      feed.innerHTML = '<p class="error-message" style="display:block;">Could not load photos right now.</p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderFeed);
  } else {
    renderFeed();
  }
})();
