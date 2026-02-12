# My Domain Static Site

This is the repository that hosts my static website hosted at https://darrencohen.me

## Now page workflow

Edit `content/now.md` to update the content shown on `now.html`.

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
