# My Domain Static Site

This is the repository that hosts my static website hosted at https://darrencohen.me

## Photo stream workflow

### Option 1: Local script (desktop)

```bash
node scripts/add-photo.mjs /path/to/photo.jpg "Caption text" "Optional location"
```

Then publish:

```bash
git add images data/photos.json
git commit -m "Add new photo post"
git push
```

Share any post with:

```text
/gallery.html#post-id
```

### Option 2: GitHub Action (desktop + iOS/Working Copy)

Drop photos in `incoming/`, commit, and push. GitHub Actions will:

- move files to `images/`
- update `data/photos.json`
- generate optimized `AVIF` and `WebP` variants in `images/optimized/`
- commit back to the repo automatically

Filename metadata format:

```text
YYYY-MM-DD__slug__location__caption.jpg
```

Example:

```text
2026-02-09__brooklyn-bridge__nyc__sunset-ride.jpg
```

Optional sidecar metadata file (same basename as image):

`incoming/IMG_1234.jpg`
`incoming/IMG_1234.json`

```json
{
  "caption": "Sunset ride over the bridge.",
  "location": "Brooklyn Bridge, NYC",
  "takenOn": "2026-02-09",
  "alt": "Cyclist riding across Brooklyn Bridge at sunset"
}
```

## Optional authenticated web upload portal

This repo now includes a private admin portal + Cloudflare Worker backend.

Files:

- `admin.html` + `js/admin.js` (private publish form)
- `microblog.html` + `js/microblog.js` (public microblog page)
- `data/microblog.json` (microblog data source)
- `cloudflare-admin/` (worker code + wrangler config)

### Security model

- Worker endpoint should be protected by Cloudflare Access.
- Worker additionally checks:
  - `cf-access-authenticated-user-email` equals your configured email
  - `cf-access-jwt-assertion` contains your Access audience (`aud`)
- Secrets stay server-side in Worker environment.

### Worker setup

1. Install Wrangler and login:

```bash
npm install -g wrangler
wrangler login
```

2. Edit `cloudflare-admin/wrangler.toml` values (`SITE_BASE_URL`, `GITHUB_BRANCH`).

3. Set required worker secrets:

```bash
cd cloudflare-admin
wrangler secret put ACCESS_ALLOWED_EMAIL
wrangler secret put ACCESS_AUD
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
wrangler secret put GITHUB_TOKEN
```

Optional (for cross-posting):

```bash
wrangler secret put BLUESKY_HANDLE
wrangler secret put BLUESKY_APP_PASSWORD
wrangler secret put MASTODON_BASE_URL
wrangler secret put MASTODON_ACCESS_TOKEN
```

4. Deploy:

```bash
wrangler deploy
```

### Access policy

In Cloudflare Zero Trust:

1. Create an Access application for your Worker domain and path `/api/*`.
2. Add policy: allow only your email address.
3. Copy the Access audience value and set it as `ACCESS_AUD` in Worker secrets.

### Portal usage

1. Open `admin.html`.
2. Set the Worker API endpoint (example: `https://landingpage-admin.<subdomain>.workers.dev/api/publish`).
3. For photo:
  - upload a file
  - add date/caption/location
  - submit
  - worker writes into `incoming/` so the existing GitHub Action pipeline processes/optimizes it
4. For microblog:
  - write text
  - optionally toggle Bluesky/Mastodon cross-post
  - submit
