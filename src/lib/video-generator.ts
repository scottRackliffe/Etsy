import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { logger } from "@/lib/logging";

/* eslint-disable @typescript-eslint/no-require-imports */
const FFMPEG: string = require("ffmpeg-static") as string;
const VIDEO_SIZE = 1080;
const TARGET_DURATION = 8;
const FPS = 24;
const CROSSFADE_FRAMES = Math.round(0.3 * FPS);

type PhotoClassification = {
  photo_index: number;
  type: string;
  confidence: number;
};

const TYPE_PRIORITY: Record<string, number> = {
  hero: 0,
  angle: 1,
  detail: 2,
  backstamp: 3,
  scale: 4,
  measurement: 5,
  underside: 6,
  imperfection: 7,
  grouping: 8,
  lifestyle: 9,
  extra: 10,
};

const TYPE_WEIGHT: Record<string, number> = {
  hero: 2.5,
  backstamp: 2.0,
  imperfection: 1.5,
  detail: 1.5,
  angle: 1.0,
  scale: 1.0,
  measurement: 1.0,
  underside: 1.0,
  grouping: 1.0,
  lifestyle: 1.0,
  extra: 1.0,
};

function orderPhotos(
  photoPaths: string[],
  classifications?: PhotoClassification[]
): { path: string; type: string; weight: number }[] {
  if (!classifications || classifications.length === 0) {
    const perPhoto = TARGET_DURATION / photoPaths.length;
    return photoPaths.map((p) => ({ path: p, type: "extra", weight: perPhoto }));
  }

  const indexed = photoPaths.map((p, i) => {
    const cls = classifications.find((c) => c.photo_index === i);
    const type = cls?.type ?? "extra";
    return { path: p, type, priority: TYPE_PRIORITY[type] ?? 10 };
  });

  indexed.sort((a, b) => a.priority - b.priority);

  const totalWeight = indexed.reduce((sum, item) => sum + (TYPE_WEIGHT[item.type] ?? 1), 0);
  return indexed.map((item) => ({
    path: item.path,
    type: item.type,
    weight: ((TYPE_WEIGHT[item.type] ?? 1) / totalWeight) * TARGET_DURATION,
  }));
}

async function prepareSquareFrame(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await sharp(inputPath)
    .resize(VIDEO_SIZE, VIDEO_SIZE, {
      fit: "contain",
      background: { r: 8, g: 26, b: 52, alpha: 1 },
    })
    .jpeg({ quality: 92 })
    .toFile(outputPath);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 120_000 }, (error, _stdout, stderr) => {
      if (error) {
        logger.error("ffmpeg failed", { error: error.message, stderr });
        reject(new Error(`ffmpeg failed: ${error.message}`));
        return;
      }
      resolve();
    });
  });
}

export type GenerateVideoInput = {
  photoPaths: string[];
  classifications?: PhotoClassification[];
  outputPath: string;
};

export type GenerateVideoResult = {
  videoPath: string;
  durationSeconds: number;
  photoCount: number;
};

export async function generateListingVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  const { photoPaths, classifications, outputPath } = input;

  if (photoPaths.length === 0) {
    throw new Error("At least one photo is required to generate a video");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "etsy-video-"));

  try {
    const ordered = orderPhotos(photoPaths, classifications);
    const preparedPaths: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, "0")}.jpg`);
      await prepareSquareFrame(ordered[i].path, framePath);
      preparedPaths.push(framePath);
    }

    const totalFrames = TARGET_DURATION * FPS;
    const photoCount = preparedPaths.length;

    if (photoCount === 1) {
      const zoomDuration = totalFrames;
      const filterComplex = [
        `[0:v]scale=${VIDEO_SIZE * 2}:${VIDEO_SIZE * 2},` +
          `zoompan=z='min(zoom+0.0008,1.3)':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${zoomDuration}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${FPS},` +
          `format=yuv420p[v]`,
      ].join(";");

      await runFfmpeg([
        "-y",
        "-loop", "1",
        "-i", preparedPaths[0],
        "-filter_complex", filterComplex,
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-t", String(TARGET_DURATION),
        "-an",
        "-movflags", "+faststart",
        outputPath,
      ]);
    } else {
      const frameAllocs = ordered.map((o) => Math.max(Math.round(o.weight * FPS), FPS));
      const totalAllocated = frameAllocs.reduce((a, b) => a + b, 0);
      const scale = totalFrames / totalAllocated;
      const scaledFrames = frameAllocs.map((f) => Math.max(Math.round(f * scale), FPS));

      const inputs: string[] = [];
      for (const p of preparedPaths) {
        inputs.push("-loop", "1", "-t", String(TARGET_DURATION + 2), "-i", p);
      }

      const filters: string[] = [];
      for (let i = 0; i < photoCount; i++) {
        const dur = scaledFrames[i];
        const zoomRate = 0.0005 + Math.random() * 0.0005;
        const startX = Math.random() > 0.5 ? "0" : `iw/2-(iw/zoom/2)`;
        const startY = Math.random() > 0.5 ? "0" : `ih/2-(ih/zoom/2)`;

        filters.push(
          `[${i}:v]scale=${VIDEO_SIZE * 2}:${VIDEO_SIZE * 2},` +
            `zoompan=z='min(zoom+${zoomRate.toFixed(6)},1.25)':` +
            `x='${startX}':y='${startY}':` +
            `d=${dur}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${FPS}[z${i}]`
        );
      }

      let currentLabel = "z0";
      for (let i = 1; i < photoCount; i++) {
        const outLabel = i < photoCount - 1 ? `x${i}` : "v";
        const offset = scaledFrames.slice(0, i).reduce((a, b) => a + b, 0) - CROSSFADE_FRAMES;
        const offsetSec = Math.max(offset / FPS, 0).toFixed(3);
        filters.push(
          `[${currentLabel}][z${i}]xfade=transition=fade:duration=${(CROSSFADE_FRAMES / FPS).toFixed(3)}:offset=${offsetSec}[${outLabel}]`
        );
        currentLabel = outLabel;
      }

      filters.push(`[v]format=yuv420p[out]`);

      await runFfmpeg([
        "-y",
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", "[out]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-t", String(TARGET_DURATION),
        "-an",
        "-movflags", "+faststart",
        outputPath,
      ]);
    }

    const stats = fs.statSync(outputPath);
    if (stats.size > 100 * 1024 * 1024) {
      logger.warn("Generated video exceeds Etsy 100MB limit", {
        size: stats.size,
        path: outputPath,
      });
    }

    return {
      videoPath: outputPath,
      durationSeconds: TARGET_DURATION,
      photoCount,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
