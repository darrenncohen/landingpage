#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const incomingDir = path.join(repoRoot, "incoming");
const imagesDir = path.join(repoRoot, "images");
const photosJsonPath = path.join(repoRoot, "data", "photos.json");
const supportedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
const cfAccountId = process.env.CF_IMAGES_ACCOUNT_ID || "";
const cfApiToken = process.env.CF_IMAGES_API_TOKEN || "";
const cfDeliveryHash = process.env.CF_IMAGES_DELIVERY_HASH || "";
const cfVariant = process.env.CF_IMAGES_VARIANT || "public";
const cloudflareEnabled = Boolean(cfAccountId && cfApiToken && cfDeliveryHash);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function decodeField(value) {
  return String(value || "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function mimeTypeForExt(ext) {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    default:
      return "application/octet-stream";
  }
}

async function uploadToCloudflareImages({ filePath, fileName, ext, metadata }) {
  if (!cloudflareEnabled) {
    return null;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeTypeForExt(ext) });
  form.append("file", blob, fileName);
  form.append("metadata", JSON.stringify(metadata));
  form.append("requireSignedURLs", "false");

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfApiToken}`
    },
    body: form
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success || !payload?.result?.id) {
    throw new Error(
      `Cloudflare upload failed (${response.status}): ${
        payload?.errors?.map((e) => e.message).join(", ") || "unknown error"
      }`
    );
  }

  return {
    imageId: payload.result.id,
    deliveryHash: cfDeliveryHash,
    variant: cfVariant
  };
}

function readSidecar(sidecarPath) {
  if (!fs.existsSync(sidecarPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    console.warn(`Skipping invalid sidecar JSON: ${path.relative(repoRoot, sidecarPath)}`);
    return {};
  }
}

function parseFilenameMetadata(fileNameNoExt) {
  const parts = fileNameNoExt.split("__");
  const out = {};

  if (parts.length > 0 && isValidDate(parts[0])) {
    out.takenOn = parts[0];
  }

  if (parts.length > 1 && parts[1]) {
    out.slug = slugify(parts[1]);
    out.slugText = decodeField(parts[1]);
  }

  if (isValidDate(parts[0]) && parts.length === 3) {
    out.caption = decodeField(parts[2]);
    return out;
  }

  if (parts.length > 2 && parts[2]) {
    out.location = decodeField(parts[2]);
  }
  if (parts.length > 3 && parts[3]) {
    out.caption = decodeField(parts[3]);
  }

  return out;
}

function nextUniqueId(baseId, usedIds) {
  let id = baseId || `photo-${Date.now()}`;
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }

  let n = 2;
  while (usedIds.has(`${id}-${n}`)) {
    n += 1;
  }
  const unique = `${id}-${n}`;
  usedIds.add(unique);
  return unique;
}

if (!fs.existsSync(incomingDir)) {
  console.log("No incoming/ directory. Nothing to process.");
  process.exit(0);
}

if (!fs.existsSync(photosJsonPath)) {
  console.error("Missing data/photos.json.");
  process.exit(1);
}

const photos = JSON.parse(fs.readFileSync(photosJsonPath, "utf8"));
const usedIds = new Set(photos.map((p) => p.id).filter(Boolean));

const imageFiles = fs
  .readdirSync(incomingDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => supportedExt.has(path.extname(name).toLowerCase()))
  .sort((a, b) => b.localeCompare(a));

if (imageFiles.length === 0) {
  console.log("No incoming image files found.");
  process.exit(0);
}

const newEntries = [];

for (const imageName of imageFiles) {
  const ext = path.extname(imageName).toLowerCase();
  const baseName = path.basename(imageName, ext);
  const sourcePath = path.join(incomingDir, imageName);
  const sidecarPath = path.join(incomingDir, `${baseName}.json`);

  const sidecar = readSidecar(sidecarPath);
  const fromFileName = parseFilenameMetadata(baseName);

  const takenOn = isValidDate(sidecar.takenOn) ? sidecar.takenOn : fromFileName.takenOn || todayIso();
  const location = String(sidecar.location || fromFileName.location || "").trim();
  const structuredNameDetected = Boolean(
    fromFileName.takenOn || fromFileName.slug || fromFileName.location || fromFileName.caption
  );
  const captionFromName = fromFileName.caption || fromFileName.slugText || "";
  const captionFallback = structuredNameDetected ? captionFromName : decodeField(baseName);
  const caption = String(sidecar.caption || captionFallback || "Photo").trim();
  const alt = String(sidecar.alt || caption).trim();

  const idBase =
    slugify(sidecar.id) ||
    fromFileName.slug ||
    `${slugify(baseName) || "photo"}-${takenOn.replaceAll("-", "")}`;
  const id = nextUniqueId(idBase, usedIds);

  const destinationName = `${id}${ext}`;
  const destinationPath = path.join(imagesDir, destinationName);
  fs.renameSync(sourcePath, destinationPath);

  let cloudflare = null;
  if (cloudflareEnabled) {
    try {
      cloudflare = await uploadToCloudflareImages({
        filePath: destinationPath,
        fileName: destinationName,
        ext,
        metadata: { id, takenOn, location, caption }
      });
    } catch (error) {
      console.warn(`Cloudflare upload skipped for ${destinationName}: ${error.message}`);
    }
  }

  if (fs.existsSync(sidecarPath)) {
    fs.rmSync(sidecarPath);
  }

  const entry = {
    id,
    src: `images/${destinationName}`,
    alt,
    caption,
    location,
    takenOn
  };
  if (cloudflare) {
    entry.cloudflare = cloudflare;
  }

  newEntries.push(entry);
  console.log(`Processed ${imageName} -> images/${destinationName}`);
}

const merged = [...newEntries, ...photos];
fs.writeFileSync(photosJsonPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

console.log(`Added ${newEntries.length} photo post(s) to data/photos.json.`);
