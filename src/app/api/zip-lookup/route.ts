import { NextRequest, NextResponse } from "next/server";
import { errorResponse, fromUnknownError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const zip = request.nextUrl.searchParams.get("zip")?.trim();
    if (!zip || zip.length < 3) {
      return NextResponse.json({ ok: true, city: null, state: null });
    }

    const country = request.nextUrl.searchParams.get("country")?.trim()?.toLowerCase() || "us";
    const res = await fetch(`https://api.zippopotam.us/${country}/${zip}`, {
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: true, city: null, state: null });
    }

    const data = (await res.json()) as {
      places?: Array<{
        "place name"?: string;
        "state abbreviation"?: string;
        state?: string;
      }>;
    };

    const place = data.places?.[0];
    if (!place) {
      return NextResponse.json({ ok: true, city: null, state: null });
    }

    return NextResponse.json({
      ok: true,
      city: place["place name"] ?? null,
      state: place["state abbreviation"] ?? null,
    });
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "ZIP lookup failed",
        userMessage: "Could not look up the ZIP code.",
        actions: ["Enter city and state manually."],
      })
    );
  }
}
