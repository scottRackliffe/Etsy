import { NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";
import { getDb } from "@/lib/sqlite";

/**
 * GET /api/vendors/match?name=SAVERS+THRIFT
 *
 * Fuzzy-matches the given name against active vendors.
 * Returns ranked candidates: exact match first, then prefix, then substring,
 * then Levenshtein-ish token overlap.
 */
export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const raw = (u.searchParams.get("name") ?? "").trim();
    if (!raw) {
      return NextResponse.json({ matches: [] });
    }

    const db = getDb();
    const vendors = db
      .prepare("SELECT id, name FROM vendors WHERE is_active = 1 ORDER BY name")
      .all() as Array<{ id: number; name: string }>;

    const needle = raw.toLowerCase();
    const needleTokens = needle.split(/\s+/).filter(Boolean);

    type Match = { id: number; name: string; score: number; reason: string };
    const matches: Match[] = [];

    for (const v of vendors) {
      const haystack = v.name.toLowerCase();
      const haystackTokens = haystack.split(/\s+/).filter(Boolean);

      if (haystack === needle) {
        matches.push({ id: v.id, name: v.name, score: 100, reason: "exact" });
        continue;
      }

      if (haystack.startsWith(needle) || needle.startsWith(haystack)) {
        matches.push({ id: v.id, name: v.name, score: 90, reason: "prefix" });
        continue;
      }

      if (haystack.includes(needle) || needle.includes(haystack)) {
        matches.push({ id: v.id, name: v.name, score: 80, reason: "contains" });
        continue;
      }

      const commonTokens = needleTokens.filter((t) =>
        haystackTokens.some((h) => h.includes(t) || t.includes(h))
      );
      if (commonTokens.length > 0) {
        const tokenScore = Math.round(
          (commonTokens.length / Math.max(needleTokens.length, haystackTokens.length)) * 70
        );
        if (tokenScore >= 20) {
          matches.push({ id: v.id, name: v.name, score: tokenScore, reason: "token" });
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      query: raw,
      matches: matches.slice(0, 5),
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to match vendor",
        userMessage: "Could not search vendors.",
        actions: ["Retry in a moment."],
      })
    );
  }
}
