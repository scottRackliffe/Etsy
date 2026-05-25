import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";

const TIPS_DIR = path.join(process.cwd(), "system", "tips");

function safeFilename(name: string): string | null {
  const base = path.basename(name);
  if (base !== name || base.includes("..")) return null;
  if (!/\.(md|txt)$/i.test(base)) return null;
  return base;
}

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  try {
    const raw = decodeURIComponent((await context.params).name);
    const filename = safeFilename(raw);
    if (!filename) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid filename",
        userMessage: "That tutorial file name is not allowed.",
        actions: ["Pick a file from the tutorial list."],
        canRetry: false,
      });
    }
    const fullPath = path.join(TIPS_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "File not found",
        userMessage: "That tutorial file was not found.",
        actions: ["Refresh the Tutorial tab."],
        canRetry: false,
      });
    }
    const content = fs.readFileSync(fullPath, "utf8");
    return NextResponse.json({
      ok: true,
      filename,
      title: filename.replace(/\.(md|txt)$/i, "").replace(/_/g, " "),
      content,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to read tutorial file",
        userMessage: "We could not open that tutorial file.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
