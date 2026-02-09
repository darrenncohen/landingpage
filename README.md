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

## Cloudflare Images (preferred for future proofing)

When these GitHub repo secrets are set, uploads are also copied to Cloudflare Images and gallery rendering will prefer Cloudflare URLs:

- `CF_IMAGES_ACCOUNT_ID`
- `CF_IMAGES_API_TOKEN`
- `CF_IMAGES_DELIVERY_HASH`
- `CF_IMAGES_VARIANT` (optional, defaults to `public`)

### One-time setup

1. In Cloudflare Images, create a variant named `public` (or set `CF_IMAGES_VARIANT` to your variant name).
2. In GitHub repo settings, add the secrets above.
3. Run the `Process Incoming Photos` workflow manually once (`workflow_dispatch`) to backfill existing photos to Cloudflare.

### Ongoing upload flow (desktop + iOS)

1. Add photo to `incoming/`.
2. Optional: add `incoming/<same-name>.json` metadata sidecar.
3. Commit and push.
4. Workflow will:
   - move image to `images/`
   - optimize local variants
   - upload image to Cloudflare Images
   - update `data/photos.json`
   - commit changes back

## Optional authenticated web upload portal

Yes, this is possible.

Recommended architecture:

- Static site stays on GitHub Pages (or any host).
- Add a Cloudflare Worker endpoint for uploads.
- Protect Worker with Cloudflare Access (Google login).
- Worker receives image + metadata, uploads to Cloudflare Images, opens a PR or commit to update `data/photos.json`.

This is more complex than the current workflow, so keep manual/shortcut upload first and add portal later when you want.
