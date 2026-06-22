/**
 * Neutral photo-loading utilities for the listing AI engine.
 * Provides filesystem → CoachPhotoFile conversion for the Generate path.
 * (ADR-085, WS-L1)
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { CoachPhotoFile } from "@/lib/listing-ai";

export type { CoachPhotoFile } from "@/lib/listing-ai";

/**
 * Load a list of inventory picture file paths from the filesystem into
 * CoachPhotoFile objects suitable for the listing AI engine.
 * Paths that are HTTP URLs are skipped (not supported for server-side loading).
 * Missing or unreadable files are silently skipped to keep generation resilient.
 */
export async function loadPhotosFromPaths(paths: string[]): Promise<CoachPhotoFile[]> {
  const results: CoachPhotoFile[] = [];
  for (const ref of paths) {
    if (/^https?:\/\//i.test(ref)) continue;
    try {
      const absolutePath = path.isAbsolute(ref) ? ref : path.join(process.cwd(), ref);
      const buffer = await fs.readFile(absolutePath);
      const filename = path.basename(absolutePath);
      results.push({ buffer, filename });
    } catch {
      // skip unreadable files; generation continues with whatever is available
    }
  }
  return results;
}
