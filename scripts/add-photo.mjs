#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const photosJsonPath = path.join(repoRoot, "data", "photos.json");
const imagesDir = path.join(repoRoot, "images");

function usage() {
  console.log('Usage: node scripts/add-photo.mjs /path/to/photo.jpg "Caption text" "Optional location"');
}

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function nowStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

const [sourceArg, captionArg, locationArg] = process.argv.slice(2);

if (!sourceArg || !captionArg) {
  usage();
  process.exit(1);
}

if (!fs.existsSync(photosJsonPath)) {
  console.error("Missing data/photos.json. Run this in the project root.");
  process.exit(1);
}

const sourcePath = path.resolve(sourceArg);
if (!fs.existsSync(sourcePath)) {
  console.error(`Image not found: ${sourcePath}`);
  process.exit(1);
}

const ext = path.extname(sourcePath).toLowerCase() || ".jpg";
const safeCaptionSlug = toSlug(captionArg) || "photo";
const id = `${safeCaptionSlug}-${nowStamp()}`;
const imageFileName = `${id}${ext}`;
const imageDestPath = path.join(imagesDir, imageFileName);
const imageSitePath = `images/${imageFileName}`;

fs.copyFileSync(sourcePath, imageDestPath);

const rawJson = fs.readFileSync(photosJsonPath, "utf8");
const photos = JSON.parse(rawJson);

const today = new Date().toISOString().slice(0, 10);
const entry = {
  id,
  src: imageSitePath,
  alt: captionArg,
  caption: captionArg,
  location: locationArg || "",
  takenOn: today
};

photos.unshift(entry);
fs.writeFileSync(photosJsonPath, `${JSON.stringify(photos, null, 2)}\n`, "utf8");

const localShare = `/gallery.html#${id}`;
console.log("Photo added.");
console.log(`Image: ${imageSitePath}`);
console.log(`Post id: ${id}`);
console.log(`Share link: ${localShare}`);
console.log("Next: git add images data/photos.json && git commit && git push");
