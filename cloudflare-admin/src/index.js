const MICROBLOG_DATA_PATH = "data/microblog.json";
const MICROBLOG_POSTS_DIR = "p";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }
    if (pathname === "/health") {
      return jsonResponse({ ok: true }, 200, request, env);
    }
    if (pathname === "/" && request.method === "GET") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/admin",
          "cache-control": "no-store"
        }
      });
    }
    if (pathname === "/admin" && request.method === "GET") {
      // Serve the admin UI from the Worker itself to avoid CORS/Access redirect issues.
      return new Response(adminHtml(env), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }
    if (pathname === "/api/publish" && request.method === "POST") {
      try {
        await assertAuthorized(request, env);
        const result = await handlePublish(request, env);
        return jsonResponse(result, 200, request, env);
      } catch (error) {
        const status = error.status || 500;
        return jsonResponse({ error: error.message || "Request failed" }, status, request, env);
      }
    }
    if (pathname === "/api/publish") {
      return jsonResponse({ error: "Method not allowed" }, 405, request, env);
    }
    return jsonResponse({ error: "Not found" }, 404, request, env);
  }
};

function adminHtml(env) {
  const title = "Admin Publish";
  const site = (env.SITE_BASE_URL || "").replace(/\/$/, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px}
    h1{margin:0 0 6px 0}
    p{margin:0 0 18px 0;opacity:.8}
    label{display:block;font-weight:600;margin-top:14px;margin-bottom:6px}
    input,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;font:inherit}
    textarea{min-height:120px;resize:vertical}
    .row{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}
    .row label{display:flex;align-items:center;gap:8px;font-weight:600;margin:0}
    .btn{margin-top:16px;display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;cursor:pointer;font-weight:700}
    .status{margin-top:12px}
    .ok{color:#16a34a}
    .err{color:#dc2626}
    .muted{opacity:.8}
    hr{border:none;border-top:1px solid rgba(128,128,128,.25);margin:18px 0}
  </style>
	  <script>
	    function setDefaults(){
	      if(document.documentElement.dataset.defaultsApplied) return;
	      // Defeat browser restore/autofill so "photo stream" stays off by default.
	      const photoStream = document.querySelector('input[name="publishPhotoStream"]');
	      const attachPhoto = document.querySelector('input[name="attachPhotoToSocial"]');
	      if(photoStream) photoStream.checked = false;
	      if(attachPhoto) attachPhoto.checked = false;
	      document.documentElement.dataset.defaultsApplied = "1";
	    }
	    window.addEventListener('pageshow', setDefaults);

	    async function publish(e){
	      e.preventDefault();
	      const form = e.target;
	      const status = document.getElementById('status');
	      status.className = 'status muted';
	      status.textContent = 'Publishing...';
      try{
        const fd = new FormData(form);
        const resp = await fetch('/api/publish',{method:'POST',body:fd,credentials:'include'});
        const payload = await resp.json().catch(()=>null);
        if(!resp.ok){ throw new Error((payload&&payload.error)||('HTTP '+resp.status)); }
        const parts=[];
        if(payload.photo){ parts.push('Photo queued'); }
        if(payload.microblog){ parts.push('Microblog published'); }
        if(payload.crosspost&&payload.crosspost.length){ parts.push('Cross-posted: '+payload.crosspost.join(', ')); }
        if(payload.crosspostErrors){
          const keys = Object.keys(payload.crosspostErrors);
          if(keys.length){
            parts.push('Cross-post errors: '+keys.map(k=>k+': '+payload.crosspostErrors[k]).join(' | '));
          }
        }
        status.className = 'status ok';
        status.textContent = parts.join(' | ') || 'Done';
        form.reset();
      }catch(err){
        status.className = 'status err';
        status.textContent = err && err.message ? err.message : 'Publish failed';
      }
    }
  </script>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Private publishing form. Site: ${escapeHtml(site || "(not set)")}</p>

	  <form onsubmit="publish(event)" autocomplete="off">
    <label for="microText">Microblog text</label>
    <textarea id="microText" name="microText" placeholder="Optional when uploading a photo to the stream (we'll use the photo caption + a gallery link)"></textarea>

    <div class="row">
      <label><input type="checkbox" name="publishMicroblog" checked /> Publish microblog entry</label>
      <label><input type="checkbox" name="postToBluesky" /> Cross-post to Bluesky</label>
      <label><input type="checkbox" name="postToMastodon" /> Cross-post to Mastodon</label>
      <label><input type="checkbox" name="includePermalink" /> Include link back</label>
    </div>

    <hr />

    <label for="photoFile">Photo (optional)</label>
    <input id="photoFile" name="photoFile" type="file" accept="image/*" />

    <label for="photoCaption">Photo caption</label>
    <input id="photoCaption" name="photoCaption" type="text" placeholder="Optional" />

    <label for="photoLocation">Photo location</label>
    <input id="photoLocation" name="photoLocation" type="text" placeholder="Optional" />

    <label for="photoDate">Photo date</label>
    <input id="photoDate" name="photoDate" type="date" />

    <div class="row">
      <label><input type="checkbox" name="publishPhotoStream" /> Add to photo stream</label>
      <label><input type="checkbox" name="attachPhotoToSocial" /> Attach photo to cross-posts</label>
    </div>

    <button class="btn" type="submit">Publish</button>
    <div id="status" class="status muted">Ready.</div>
  </form>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function handlePublish(request, env) {
  requireEnv(env, ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN", "ACCESS_ALLOWED_EMAIL", "ACCESS_AUD"]);

  const github = createGithubClient(env);
  const form = await request.formData();
  const publishMicroblog = form.get("publishMicroblog") === "on";
  const publishPhotoStream = form.get("publishPhotoStream") === "on";

  if (!publishMicroblog && !publishPhotoStream) {
    throw httpError(400, "Pick at least one destination");
  }

  const response = { ok: true };

  if (publishPhotoStream) {
    const photoFile = form.get("photoFile");
    if (photoFile && typeof photoFile.arrayBuffer === "function" && photoFile.size > 0) {
      response.photo = await queuePhotoUpload(photoFile, form, github);
      const siteBase = String(env.SITE_BASE_URL || "").replace(/\/$/, "");
      if (siteBase && response.photo?.id) {
        response.photo.galleryUrl = `${siteBase}/gallery.html#${response.photo.id}`;
      }
    } else if (!publishMicroblog) {
      throw httpError(400, "Photo file is required for photo stream publish");
    }
  }

  if (publishMicroblog) {
    let microText = String(form.get("microText") || "").trim();
    if (!microText) {
      // Convenience: if you're uploading a photo to the stream, auto-generate the microblog text.
      if (publishPhotoStream && response.photo?.id) {
        const caption = String(form.get("photoCaption") || "").trim() || "Photo";
        const siteBase = String(env.SITE_BASE_URL || "").replace(/\/$/, "");
        const galleryUrl = siteBase ? `${siteBase}/gallery.html#${response.photo.id}` : `gallery.html#${response.photo.id}`;
        microText = `${caption}\n\n${galleryUrl}`.trim();
      }
    }
    if (!microText) throw httpError(400, "Microblog text is required");
    const postToBluesky = form.get("postToBluesky") === "on";
    const postToMastodon = form.get("postToMastodon") === "on";
    const includeLink = form.get("includePermalink") === "on";
    const attachPhotoToSocial = form.get("attachPhotoToSocial") === "on";
    const photoFile = form.get("photoFile");
    const photoAttachment =
      attachPhotoToSocial && photoFile && typeof photoFile.arrayBuffer === "function" && photoFile.size > 0
        ? {
            name: photoFile.name || "photo.jpg",
            mime: photoFile.type || "image/jpeg",
            bytes: await photoFile.arrayBuffer(),
            alt: String(form.get("photoCaption") || "").trim() || "Photo"
          }
        : null;

    const micro = await publishMicroblogPost(
      microText,
      postToBluesky,
      postToMastodon,
      includeLink,
      photoAttachment,
      github,
      env
    );
    response.microblog = micro.post;
    response.crosspost = micro.crosspost;
    if (micro.crosspostErrors && Object.keys(micro.crosspostErrors).length) {
      response.crosspostErrors = micro.crosspostErrors;
    }
  }

  return response;
}

async function queuePhotoUpload(file, form, github) {
  const inputDate = String(form.get("photoDate") || "").trim();
  const takenOn = /^\d{4}-\d{2}-\d{2}$/.test(inputDate) ? inputDate : todayIsoDate();
  const caption = String(form.get("photoCaption") || "").trim();
  const location = String(form.get("photoLocation") || "").trim();
  const slugSource = caption || file.name || `photo-${Date.now()}`;
  const slug = slugify(slugSource);
  const ext = extensionFromFilename(file.name || "upload.jpg");

  // Reserve a stable ID at upload time so we can link to it immediately (even before the GitHub Action runs).
  // The GitHub Action reads incoming/<name>.json and will honor sidecar.id when generating data/photos.json.
  const dateCompact = takenOn.replaceAll("-", "");
  const suffixBytes = new Uint8Array(4);
  crypto.getRandomValues(suffixBytes);
  const suffix = Array.from(suffixBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const idPrefix = slugify(caption || slugSource || "photo").slice(0, 32) || "photo";
  const reservedId = `${idPrefix}-${dateCompact}-${suffix}`;

  const captionPart = slugify(caption || slugSource);
  const locationPart = slugify(location);
  let incomingName = `${takenOn}__${slug}__${captionPart}.${ext}`;
  if (locationPart) {
    incomingName = `${takenOn}__${slug}__${locationPart}__${captionPart}.${ext}`;
  }
  const incomingPath = `incoming/${incomingName}`;
  const buffer = await file.arrayBuffer();
  await github.putFileBinary(incomingPath, buffer, `Queue photo upload: ${slug}`);

  const baseName = incomingName.slice(0, -(`.${ext}`.length));
  const sidecarPath = `incoming/${baseName}.json`;
  const sidecar = {
    id: reservedId,
    takenOn,
    caption,
    location,
    alt: caption || "Photo"
  };
  await github.putFileText(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, `Queue photo metadata: ${slug}`);

  return { id: reservedId, incomingPath, sidecarPath, takenOn };
}

async function publishMicroblogPost(text, postToBluesky, postToMastodon, includeLink, photoAttachment, github, env) {
  const existing = await github.readTextWithSha(MICROBLOG_DATA_PATH);
  const feed = existing?.text ? JSON.parse(existing.text) : [];
  const existingSha = existing?.sha || null;
  const id = `post-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const createdAt = new Date().toISOString();
  const siteBase = (env.SITE_BASE_URL || "").replace(/\/$/, "");
  const permalinkUrl = `${siteBase}/${MICROBLOG_POSTS_DIR}/${id}.html`;
  const urlsInText = extractUrls(text);
  const primaryUrlForCard = urlsInText[0] || (includeLink ? permalinkUrl : "");

  const entry = {
    id,
    text,
    createdAt,
    permalink: permalinkUrl
  };

  const crosspost = [];
  const crosspostErrors = {};

  if (postToBluesky && env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD) {
    try {
      const blueskyUrl = await postToBlueskyApi(
        text,
        includeLink ? permalinkUrl : "",
        primaryUrlForCard,
        photoAttachment,
        env
      );
      if (blueskyUrl) {
        entry.blueskyUrl = blueskyUrl;
        crosspost.push("Bluesky");
      } else {
        crosspostErrors.Bluesky = "Unknown failure";
      }
    } catch (error) {
      crosspostErrors.Bluesky = error.message || "Failed";
    }
  } else if (postToBluesky) {
    crosspostErrors.Bluesky = "Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD";
  }

  if (postToMastodon && env.MASTODON_BASE_URL && env.MASTODON_ACCESS_TOKEN) {
    try {
      const mastodonUrl = await postToMastodonApi(
        text,
        includeLink ? permalinkUrl : "",
        photoAttachment,
        env
      );
      if (mastodonUrl) {
        entry.mastodonUrl = mastodonUrl;
        crosspost.push("Mastodon");
      } else {
        crosspostErrors.Mastodon = "Unknown failure";
      }
    } catch (error) {
      crosspostErrors.Mastodon = error.message || "Failed";
    }
  } else if (postToMastodon) {
    crosspostErrors.Mastodon = "Missing MASTODON_BASE_URL or MASTODON_ACCESS_TOKEN";
  }

  // Always publish to the site, even if cross-posting fails.
  await github.putFileText(
    `${MICROBLOG_POSTS_DIR}/${id}.html`,
    microblogPostHtml({ siteBase, id, text, createdAt }),
    `Publish microblog permalink: ${id}`
  );
  feed.unshift(entry);
  await github.putFileText(MICROBLOG_DATA_PATH, `${JSON.stringify(feed, null, 2)}\n`, `Publish microblog post: ${id}`, existingSha);

  return { post: entry, crosspost, crosspostErrors };
}

async function postToBlueskyApi(text, permalinkUrl, cardUrl, photoAttachment, env) {
  const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: env.BLUESKY_HANDLE,
      password: env.BLUESKY_APP_PASSWORD
    })
  });
  const session = await sessionRes.json().catch(() => null);
  if (!sessionRes.ok || !session?.accessJwt || !session?.did) {
    const detail = JSON.stringify(session || {});
    throw new Error(`Bluesky login failed (${sessionRes.status}): ${detail.slice(0, 220)}`);
  }

  const message = permalinkUrl ? `${text}\n\n${permalinkUrl}`.trim() : text;
  if (!message.trim()) return "";
  const facets = buildBlueskyLinkFacets(message);

  // Bluesky can only have one embed. Prefer image embed if we have an attachment.
  let embed = undefined;
  if (photoAttachment) {
    const blob = await blueskyUploadBlob(session.accessJwt, photoAttachment.bytes, photoAttachment.mime);
    embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: photoAttachment.alt || "Photo",
          image: blob
        }
      ]
    };
  } else if (cardUrl) {
    const external = await blueskyBuildExternalEmbed(session.accessJwt, cardUrl);
    if (external) {
      embed = external;
    }
  }
  const recordRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: message,
        facets,
        embed,
        createdAt: new Date().toISOString()
      }
    })
  });
  const record = await recordRes.json().catch(() => null);
  if (!recordRes.ok || !record?.uri) {
    const errorText = JSON.stringify(record || {});
    throw new Error(`Bluesky post failed (${recordRes.status}): ${errorText.slice(0, 220)}`);
  }

  const uriParts = String(record.uri).split("/");
  const postRkey = uriParts[uriParts.length - 1];
  return `https://bsky.app/profile/${env.BLUESKY_HANDLE}/post/${postRkey}`;
}

async function postToMastodonApi(text, permalinkUrl, photoAttachment, env) {
  const base = String(env.MASTODON_BASE_URL || "").replace(/\/$/, "");
  if (!base) return "";
  const statusText = permalinkUrl ? `${text}\n\n${permalinkUrl}`.trim() : text;

  let mediaId = "";
  if (photoAttachment) {
    mediaId = await mastodonUploadMedia(base, env.MASTODON_ACCESS_TOKEN, photoAttachment);
  }

  const body = new URLSearchParams();
  body.set("status", statusText.trim());
  body.set("visibility", env.MASTODON_VISIBILITY || "unlisted");
  if (mediaId) {
    body.append("media_ids[]", mediaId);
  }

  const res = await fetch(`${base}/api/v1/statuses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.url) {
    const errorText = JSON.stringify(payload || {});
    throw new Error(`Mastodon post failed (${res.status}): ${errorText.slice(0, 220)}`);
  }
  return payload.url;
}

async function mastodonUploadMedia(base, token, attachment) {
  const form = new FormData();
  form.append("file", new Blob([attachment.bytes], { type: attachment.mime }), attachment.name);
  form.append("description", attachment.alt || "Photo");

  const res = await fetch(`${base}/api/v2/media`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`
    },
    body: form
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.id) {
    const errorText = JSON.stringify(payload || {});
    throw new Error(`Mastodon media upload failed (${res.status}): ${errorText.slice(0, 220)}`);
  }
  return payload.id;
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s)\]]+/g);
  if (!matches) return [];
  return matches;
}

function buildBlueskyLinkFacets(text) {
  const urls = extractUrls(text).slice(0, 3);
  if (urls.length === 0) return undefined;

  const facets = [];
  for (const url of urls) {
    const idx = text.indexOf(url);
    if (idx === -1) continue;
    const start = utf8ByteLength(text.slice(0, idx));
    const end = start + utf8ByteLength(url);
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }]
    });
  }
  return facets.length ? facets : undefined;
}

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

async function blueskyUploadBlob(accessJwt, bytes, mime) {
  const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessJwt}`,
      "content-type": mime || "application/octet-stream"
    },
    body: bytes
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.blob) {
    const errorText = JSON.stringify(payload || {});
    throw new Error(`Bluesky uploadBlob failed (${res.status}): ${errorText.slice(0, 220)}`);
  }
  return payload.blob;
}

async function blueskyBuildExternalEmbed(accessJwt, url) {
  const meta = await fetchOpenGraph(url);
  if (!meta) return undefined;

  let thumbBlob = undefined;
  if (meta.image) {
    try {
      thumbBlob = await blueskyUploadBlob(accessJwt, await fetchBinary(meta.image, 900_000), meta.imageMime || "image/jpeg");
    } catch (error) {}
  }

  return {
    $type: "app.bsky.embed.external",
    external: {
      uri: url,
      title: meta.title || url,
      description: meta.description || "",
      ...(thumbBlob ? { thumb: thumbBlob } : {})
    }
  };
}

async function fetchBinary(url, maxBytes) {
  const res = await fetch(url, { headers: { "user-agent": "landingpage-admin-worker" } });
  if (!res.ok) throw new Error(`fetchBinary failed (${res.status})`);
  const buf = await res.arrayBuffer();
  if (maxBytes && buf.byteLength > maxBytes) {
    throw new Error("image too large");
  }
  return buf;
}

async function fetchOpenGraph(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "landingpage-admin-worker" } });
    if (!res.ok) return null;
    const html = await res.text();
    const title = findMeta(html, "og:title") || findTitle(html);
    const description = findMeta(html, "og:description") || findMeta(html, "description") || "";
    const image = findMeta(html, "og:image") || "";
    const imageMime = image ? guessImageMime(image) : "";
    return { title, description, image, imageMime };
  } catch {
    return null;
  }
}

function findMeta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? m[1] : "";
}

function findTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "";
}

function guessImageMime(url) {
  const lower = String(url).toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function microblogPostHtml({ siteBase, id, text, createdAt }) {
  const ogImage = `${siteBase}/img/og.jpg`;
  const title = "Darren Cohen";
  const description = text;
  const url = `${siteBase}/${MICROBLOG_POSTS_DIR}/${id}.html`;
  const safeText = escapeHtml(text).replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - Microblog</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <link rel="stylesheet" href="${escapeHtml(siteBase)}/css/style.css" />
</head>
<body>
  <div class="links-header">
    <h1>Microblog</h1>
    <p>${escapeHtml(new Date(createdAt).toLocaleString())}</p>
    <a href="${escapeHtml(siteBase)}/microblog.html" class="back-button">Back to Microblog</a>
  </div>
  <div class="content-container">
    <div class="content-card">
      <article class="post" id="${escapeHtml(id)}">
        <p class="post-blurb">${safeText}</p>
      </article>
    </div>
  </div>
</body>
</html>`;
}

async function assertAuthorized(request, env) {
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (!email || email.toLowerCase() !== String(env.ACCESS_ALLOWED_EMAIL || "").toLowerCase()) {
    throw httpError(401, "Unauthorized");
  }
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!jwt) {
    throw httpError(401, "Missing access assertion");
  }
  const payload = decodeJwtPayload(jwt);
  const aud = payload?.aud;
  if (!Array.isArray(aud) || aud.indexOf(env.ACCESS_AUD) === -1) {
    throw httpError(401, "Invalid audience");
  }
  if (payload?.email && payload.email.toLowerCase() !== email.toLowerCase()) {
    throw httpError(401, "Email mismatch");
  }
  if (payload?.exp && Date.now() / 1000 > payload.exp) {
    throw httpError(401, "Expired token");
  }
}

function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt || "").split(".");
    if (parts.length < 2) throw new Error("Malformed token");
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    throw httpError(401, "Malformed access token");
  }
}

function createGithubClient(env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || "main";
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/`;
  const userAgent = env.GITHUB_USER_AGENT || "landingpage-admin-worker";
  const apiVersion = env.GITHUB_API_VERSION || "2022-11-28";

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function githubFetch(url, init, attempt = 1) {
    const response = await fetch(url, init);
    if (response.ok || response.status === 404) {
      return response;
    }

    // Retry on transient errors / secondary rate limits.
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
    if (!retryable || attempt >= 5) {
      return response;
    }

    const retryAfter = Number(response.headers.get("retry-after") || "0");
    const baseDelayMs = retryAfter > 0 ? retryAfter * 1000 : 800 * Math.pow(2, attempt - 1);
    const jitterMs = Math.floor(Math.random() * 250);
    await sleep(baseDelayMs + jitterMs);
    return githubFetch(url, init, attempt + 1);
  }

  async function getFile(filePath) {
    const encodedPath = encodePath(filePath);
    const response = await githubFetch(`${baseUrl}${encodedPath}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": userAgent,
        "x-github-api-version": apiVersion
      }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw httpError(500, `GitHub read failed (${response.status}) for ${filePath}: ${detail.slice(0, 500)}`);
    }
    return response.json();
  }

  async function putFile(filePath, contentBase64, message, sha) {
    const encodedPath = encodePath(filePath);
    const body = {
      message,
      content: contentBase64,
      branch
    };
    if (sha) body.sha = sha;

    let response = await githubFetch(`${baseUrl}${encodedPath}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": userAgent,
        "x-github-api-version": apiVersion
      },
      body: JSON.stringify(body)
    });

    // If we attempted a create but the file exists, fetch sha and retry once as update.
    if (response.status === 422 && !sha) {
      const existing = await getFile(filePath);
      if (existing?.sha) {
        body.sha = existing.sha;
        response = await githubFetch(`${baseUrl}${encodedPath}`, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": userAgent,
            "x-github-api-version": apiVersion
          },
          body: JSON.stringify(body)
        });
      }
    }

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      throw httpError(500, `GitHub write failed (${response.status}) for ${filePath}: ${err.slice(0, 500)}`);
    }
    return response.json();
  }

  return {
    async readTextWithSha(filePath) {
      const file = await getFile(filePath);
      if (!file) return null;
      const normalized = String(file.content || "").replace(/\n/g, "");
      return { text: decodeBase64Utf8(normalized), sha: file.sha };
    },
    async readText(filePath) {
      const file = await getFile(filePath);
      if (!file) return null;
      const normalized = String(file.content || "").replace(/\n/g, "");
      return decodeBase64Utf8(normalized);
    },
    async putFileText(filePath, text, message, sha) {
      return putFile(filePath, encodeUtf8Base64(text), message, sha);
    },
    async putFileBinary(filePath, buffer, message) {
      // Usually new files (incoming/*). Avoid read-before-write; GitHub create doesn't need sha.
      return putFile(filePath, arrayBufferToBase64(buffer), message, null);
    }
  };
}

async function readJsonFile(github, filePath, fallbackValue) {
  const text = await github.readText(filePath);
  if (!text) return fallbackValue;
  try {
    return JSON.parse(text);
  } catch {
    return fallbackValue;
  }
}

function corsHeaders(request, env) {
  const requestOrigin = request.headers.get("origin") || "";
  const defaultOrigin = (env.SITE_BASE_URL || "").replace(/\/$/, "");
  const configuredOrigin = (env.ADMIN_ORIGIN || "").replace(/\/$/, "");
  const allowedOrigin = configuredOrigin || defaultOrigin || requestOrigin;
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function jsonResponse(payload, status, request, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env)
    }
  });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function extensionFromFilename(name) {
  const lower = String(name || "").toLowerCase();
  const m = lower.match(/\.([a-z0-9]+)$/);
  if (!m) return "jpg";
  return m[1];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "post";
}

function requireEnv(env, keys) {
  keys.forEach((key) => {
    if (!env[key]) {
      throw httpError(500, `Missing environment value: ${key}`);
    }
  });
}

function encodePath(filePath) {
  return String(filePath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
