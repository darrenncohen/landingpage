# My Domain Static Site

This is the repository that hosts my static website hosted at https://darrencohen.me

## Photo stream workflow

Add a new photo post with one command:

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
