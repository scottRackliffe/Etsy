import fsp from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import sharp from "sharp";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";
import { setSetting, getSetting } from "@/lib/settings-store";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 200;
const RELATIVE_PATH = "uploads/branding/report-header.png";

function getAbsolutePath(): string {
  const root = process.env.UPLOADS_PATH || path.join(process.cwd(), "uploads");
  return path.join(root, "branding", "report-header.png");
}

export async function POST(request: NextRequest) {
  try {
    requireEtsyAccessToken(await cookies());

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "No file provided",
        userMessage: "Please select an image file to upload.",
        actions: ["Choose a JPEG, PNG, or WebP image."],
      });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: `Unsupported type: ${file.type}`,
        userMessage: "Only JPEG, PNG, and WebP images are supported.",
        actions: ["Choose a JPEG, PNG, or WebP file."],
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "File too large",
        userMessage: "The image must be under 5 MB.",
        actions: ["Use a smaller or more compressed image."],
      });
    }

    const outputPath = getAbsolutePath();
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });

    await sharp(buffer)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toFile(outputPath);

    setSetting("report_header_logo_path", RELATIVE_PATH);

    return NextResponse.json({ ok: true, path: RELATIVE_PATH }, { status: 200 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to upload report header",
        userMessage: "We could not save the report header image.",
        actions: ["Try again with a different image."],
      })
    );
  }
}

export async function DELETE() {
  try {
    requireEtsyAccessToken(await cookies());

    const current = getSetting("report_header_logo_path");
    if (current) {
      const absPath = getAbsolutePath();
      try {
        await fsp.unlink(absPath);
      } catch {
        // File already gone
      }
      setSetting("report_header_logo_path", "");
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to remove report header",
        userMessage: "We could not remove the report header image.",
        actions: ["Try again in a moment."],
      })
    );
  }
}
