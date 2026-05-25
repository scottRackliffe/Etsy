import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";

const TIPS_DIR = path.join(process.cwd(), "system", "tips");

export async function GET() {
  try {
    let files: Array<{ filename: string; title: string }> = [];
    if (fs.existsSync(TIPS_DIR)) {
      files = fs
        .readdirSync(TIPS_DIR)
        .filter((name) => !name.startsWith(".") && /\.(md|pdf|txt)$/i.test(name))
        .sort((a, b) => a.localeCompare(b))
        .map((filename) => ({
          filename,
          title: filename.replace(/\.(md|pdf|txt)$/i, "").replace(/_/g, " "),
        }));
    }
    return NextResponse.json({ ok: true, files });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to list tutorial files",
        userMessage: "We could not load tutorial files.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
