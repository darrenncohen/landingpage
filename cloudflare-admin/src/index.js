const MICROBLOG_DATA_PATH = "data/microblog.json";

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

  <form onsubmit="publish(event)">
    <label for="microText">Microblog text</label>
    <textarea id="microText" name="microText" placeholder="Optional if uploading only a photo"></textarea>

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
    } else if (!publishMicroblog) {
      throw httpError(400, "Photo file is required for photo stream publish");
    }
  }

  if (publishMicroblog) {
    const microText = String(form.get("microText") || "").trim();
    if (!microText) {
      throw httpError(400, "Microblog text is required");
    }
    const postToBluesky = form.get("postToBluesky") === "on";
    const postToMastodon = form.get("postToMastodon") === "on";
    const includeLink = form.get("includePermalink") === "on";
    const micro = await publishMicroblogPost(microText, postToBluesky, postToMastodon, includeLink, github, env);
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

  const captionPart = slugify(caption || slugSource);
  const locationPart = slugify(location);
  let incomingName = `${takenOn}__${slug}__${captionPart}.${ext}`;
  if (locationPart) {
    incomingName = `${takenOn}__${slug}__${locationPart}__${captionPart}.${ext}`;
  }
  const incomingPath = `incoming/${incomingName}`;
  const buffer = await file.arrayBuffer();
  await github.putFileBinary(incomingPath, buffer, `Queue photo upload: ${slug}`);

  return { incomingPath, takenOn };
}

async function publishMicroblogPost(text, postToBluesky, postToMastodon, includeLink, github, env) {
  const existing = await github.readTextWithSha(MICROBLOG_DATA_PATH);
  const feed = existing?.text ? JSON.parse(existing.text) : [];
  const existingSha = existing?.sha || null;
  const id = `post-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const createdAt = new Date().toISOString();
  const postUrl = `${(env.SITE_BASE_URL || "").replace(/\/$/, "")}/microblog.html#${id}`;

  const entry = {
    id,
    text,
    createdAt
  };

  const crosspost = [];
  const crosspostErrors = {};

  if (postToBluesky && env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD) {
    try {
      const blueskyUrl = await postToBlueskyApi(text, includeLink ? postUrl : "", env);
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
      const mastodonUrl = await postToMastodonApi(text, includeLink ? postUrl : "", env);
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
  feed.unshift(entry);
  await github.putFileText(MICROBLOG_DATA_PATH, `${JSON.stringify(feed, null, 2)}\n`, `Publish microblog post: ${id}`, existingSha);

  return { post: entry, crosspost, crosspostErrors };
}

async function postToBlueskyApi(text, postUrl, env) {
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

  const message = postUrl ? `${text}\n\n${postUrl}`.trim() : text;
  if (!message.trim()) return "";
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

async function postToMastodonApi(text, postUrl, env) {
  const base = String(env.MASTODON_BASE_URL || "").replace(/\/$/, "");
  if (!base) return "";
  const body = new URLSearchParams();
  const statusText = postUrl ? `${text}\n\n${postUrl}`.trim() : text;
  body.set("status", statusText.trim());
  body.set("visibility", env.MASTODON_VISIBILITY || "unlisted");

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
