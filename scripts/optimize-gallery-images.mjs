#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const photosJsonPath = path.join(repoRoot, "data", "photos.json");
const defaultWidths = [640, 1080, 1600];

function runConvert(args) {
  const result = spawnSync("convert", args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "convert failed");
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function needsBuild(sourcePath, outputPath) {
  if (!fs.existsSync(outputPath)) {
    return true;
  }
  const sourceStat = fs.statSync(sourcePath);
  const outputStat = fs.statSync(outputPath);
  return sourceStat.mtimeMs > outputStat.mtimeMs;
}

function formatListForOutputs(baseRelPath, widths, ext) {
  return widths.map((w) => path.join(repoRoot, `${baseRelPath}-${w}.${ext}`));
}

if (!fs.existsSync(photosJsonPath)) {
  console.error("Missing data/photos.json");
  process.exit(1);
}

const photos = JSON.parse(fs.readFileSync(photosJsonPath, "utf8"));
let updated = false;

for (const photo of photos) {
  if (!photo || !photo.id || !photo.src) {
    continue;
  }

  const sourcePath = path.join(repoRoot, photo.src);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`Skipping missing source: ${photo.src}`);
    continue;
  }

  const widths = Array.isArray(photo.optimized?.widths) && photo.optimized.widths.length > 0
    ? photo.optimized.widths
    : defaultWidths;
  const baseRelPath = `images/optimized/${photo.id}`;
  const baseAbsPath = path.join(repoRoot, baseRelPath);
  ensureDir(path.dirname(baseAbsPath));

  const availableFormats = [];

  try {
    const webpOutputs = formatListForOutputs(baseRelPath, widths, "webp");
    for (let i = 0; i < widths.length; i += 1) {
      if (!needsBuild(sourcePath, webpOutputs[i])) {
        continue;
      }
      runConvert([
        sourcePath,
        "-auto-orient",
        "-strip",
        "-resize",
        `${widths[i]}x${widths[i]}>`,
        "-quality",
        "76",
        webpOutputs[i]
      ]);
    }
    availableFormats.push("webp");
  } catch (error) {
    console.warn(`WebP generation failed for ${photo.id}: ${error.message}`);
  }

  try {
    const avifOutputs = formatListForOutputs(baseRelPath, widths, "avif");
    for (let i = 0; i < widths.length; i += 1) {
      if (!needsBuild(sourcePath, avifOutputs[i])) {
        continue;
      }
      runConvert([
        sourcePath,
        "-auto-orient",
        "-strip",
        "-resize",
        `${widths[i]}x${widths[i]}>`,
        "-quality",
        "52",
        avifOutputs[i]
      ]);
    }
    availableFormats.push("avif");
  } catch (error) {
    console.warn(`AVIF generation failed for ${photo.id}: ${error.message}`);
  }

  const optimizedData = {
    base: baseRelPath,
    widths,
    formats: availableFormats
  };

  if (JSON.stringify(photo.optimized || {}) !== JSON.stringify(optimizedData)) {
    photo.optimized = optimizedData;
    updated = true;
  }
}

if (updated) {
  fs.writeFileSync(photosJsonPath, `${JSON.stringify(photos, null, 2)}\n`, "utf8");
}

console.log("Image optimization complete.");
