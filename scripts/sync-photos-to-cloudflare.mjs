#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const photosJsonPath = path.join(repoRoot, "data", "photos.json");
const cfAccountId = process.env.CF_IMAGES_ACCOUNT_ID || "";
const cfApiToken = process.env.CF_IMAGES_API_TOKEN || "";
const cfDeliveryHash = process.env.CF_IMAGES_DELIVERY_HASH || "";
const cfVariant = process.env.CF_IMAGES_VARIANT || "public";

if (!cfAccountId || !cfApiToken || !cfDeliveryHash) {
  console.error("Missing Cloudflare env vars: CF_IMAGES_ACCOUNT_ID, CF_IMAGES_API_TOKEN, CF_IMAGES_DELIVERY_HASH");
  process.exit(1);
}

if (!fs.existsSync(photosJsonPath)) {
  console.error("Missing data/photos.json");
  process.exit(1);
}

function mimeTypeForExt(ext) {
  switch (ext.toLowerCase()) {
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

async function uploadToCloudflareImages({ filePath, fileName, metadata }) {
  const ext = path.extname(fileName).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: mimeTypeForExt(ext) }), fileName);
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
      `Upload failed (${response.status}): ${payload?.errors?.map((e) => e.message).join(", ") || "unknown"}`
    );
  }
  return payload.result.id;
}

const photos = JSON.parse(fs.readFileSync(photosJsonPath, "utf8"));
let changed = false;

for (const photo of photos) {
  if (!photo?.id || !photo?.src) {
    continue;
  }
  if (photo.cloudflare?.imageId && photo.cloudflare?.deliveryHash) {
    continue;
  }

  const sourcePath = path.join(repoRoot, photo.src);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`Skipping missing file: ${photo.src}`);
    continue;
  }

  try {
    const imageId = await uploadToCloudflareImages({
      filePath: sourcePath,
      fileName: path.basename(sourcePath),
      metadata: {
        id: photo.id,
        takenOn: photo.takenOn || "",
        location: photo.location || "",
        caption: photo.caption || ""
      }
    });
    photo.cloudflare = {
      imageId,
      deliveryHash: cfDeliveryHash,
      variant: cfVariant
    };
    changed = true;
    console.log(`Synced to Cloudflare: ${photo.id}`);
  } catch (error) {
    console.warn(`Cloudflare sync failed for ${photo.id}: ${error.message}`);
  }
}

if (changed) {
  fs.writeFileSync(photosJsonPath, `${JSON.stringify(photos, null, 2)}\n`, "utf8");
  console.log("Updated data/photos.json with Cloudflare IDs.");
} else {
  console.log("No photo entries required syncing.");
}
