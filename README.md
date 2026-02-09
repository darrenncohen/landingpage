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

Yes, this is possible.

Recommended architecture:

- Static site stays on GitHub Pages (or any host).
- Add an upload endpoint (for example Cloudflare Worker or any small backend).
- Protect it with authentication (Google OAuth, GitHub OAuth, or Cloudflare Access).
- Endpoint can write to your repo via API and update `data/photos.json`.

This is more complex than the current workflow, so keep manual/shortcut upload first and add portal later when you want.
