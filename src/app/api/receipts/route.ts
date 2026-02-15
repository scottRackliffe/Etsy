/**
 * GET /api/receipts?shop_id=&limit=&offset=
 * Returns paginated shop receipts (orders) for the given shop_id (requires valid token cookie).
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShopReceipts } from "@/lib/etsy";

const TOKEN_COOKIE = "etsy_access_token";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not connected to Etsy" }, { status: 401 });
  }
  const searchParams = request.nextUrl.searchParams;
  const shopId = searchParams.get("shop_id");
  if (!shopId) {
    return NextResponse.json({ error: "shop_id required" }, { status: 400 });
  }
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");
  try {
    const data = await getShopReceipts(token, Number(shopId), {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("Receipts error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load receipts" },
      { status: 500 }
    );
  }
}
