import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { getUploadsRootDir } from "@/lib/picture-storage";
import { requireEtsyAccessToken } from "@/lib/auth-session";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function resolveUploadPath(segments: string[]): string | null {
  if (!segments.length || segments.some((s) => !s || s === "." || s === "..")) {
    return null;
  }
  const root = path.resolve(getUploadsRootDir());
  const candidate = path.resolve(path.join(root, ...segments));
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    return null;
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return null;
  }
  return candidate;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    requireEtsyAccessToken(await cookies());
    const segments = (await context.params).path ?? [];
    const filePath = resolveUploadPath(segments);
    if (!filePath) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Upload not found",
        userMessage: "That image file could not be found.",
        actions: ["Check the path and retry."],
        canRetry: false,
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    const body = fs.readFileSync(filePath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to serve upload",
        userMessage: "We could not load the image.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
