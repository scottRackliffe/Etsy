/**
 * Etsy Open API v3 – OAuth helpers and API client
 * Docs: https://developer.etsy.com/documentation/
 */

const ETSY_OAUTH_BASE = "https://www.etsy.com/oauth";
const ETSY_API_BASE = "https://api.etsy.com/v3/application";

export function getEtsyConfig() {
  const clientId = process.env.ETSY_CLIENT_ID;
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  const redirectUri = process.env.ETSY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing ETSY_CLIENT_ID, ETSY_CLIENT_SECRET, or ETSY_REDIRECT_URI");
  }
  return { clientId, clientSecret, redirectUri };
}

/** Generate a cryptographically random code_verifier (43–128 chars) */
export function generateCodeVerifier(): string {
  const nodeCrypto = require("crypto") as typeof import("crypto");
  const bytes = nodeCrypto.randomBytes(56);
  return base64UrlEncode(new Uint8Array(bytes));
}

/** SHA256 + base64url of code_verifier for code_challenge */
export async function getCodeChallenge(verifier: string): Promise<string> {
  const nodeCrypto = require("crypto") as typeof import("crypto");
  const buf = nodeCrypto.createHash("sha256").update(verifier, "utf8").digest();
  return base64UrlEncode(new Uint8Array(buf));
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build Etsy OAuth authorization URL (PKCE) */
export async function getEtsyAuthUrl(state: string): Promise<{ url: string; codeVerifier: string }> {
  const { clientId, redirectUri } = getEtsyConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await getCodeChallenge(codeVerifier);
  const scope = "transactions_r receipts_r shops_r";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const url = `${ETSY_OAUTH_BASE}/connect?${params.toString()}`;
  return { url, codeVerifier };
}

/** Exchange authorization code for access + refresh token */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const { clientId, clientSecret, redirectUri } = getEtsyConfig();
  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return data;
}

/** Etsy API request with API key + Bearer token */
export async function etsyApi<T>(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const key = process.env.ETSY_API_KEY_HEADER ?? process.env.ETSY_CLIENT_ID;
  if (!key) throw new Error("Missing ETSY_API_KEY_HEADER or ETSY_CLIENT_ID");
  const res = await fetch(`${ETSY_API_BASE}${path}`, {
    ...options,
    headers: {
      "x-api-key": key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Get current user's shops (need user ID from /users/me first; v3 uses shop_id) */
export async function getShops(accessToken: string): Promise<{ shop_id: number; shop_name: string }[]> {
  type Me = { user_id: string };
  const me = await etsyApi<Me>("/users/me", accessToken);
  type Shops = { results: { shop_id: number; shop_name: string }[] };
  const shops = await etsyApi<Shops>(`/users/${me.user_id}/shops`, accessToken);
  return shops.results ?? [];
}

/** Get shop receipts (orders) – paginated */
export type Receipt = {
  receipt_id: number;
  receipt_type: number;
  order_id: number;
  seller_user_id: number;
  buyer_user_id: number;
  creation_tsz: number;
  last_modified_tsz: number;
  name: string;
  first_line: string;
  second_line: string | null;
  city: string;
  state: string | null;
  zip: string;
  country_iso: string;
  payment_method: string | null;
  payment_email: string | null;
  message: string | null;
  was_paid: boolean;
  was_shipped: boolean;
  total_tax_cost: string;
  total_vat_cost: string;
  total_price: string;
  total_shipping_cost: string;
  currency_code: string;
  message_from_seller: string | null;
  message_from_buyer: string | null;
  was_digital: boolean;
  needs_gift_wrap: boolean;
  is_gift_wrap: boolean;
};

export type ShopReceiptsResponse = {
  count: number;
  results: Receipt[];
};

export async function getShopReceipts(
  accessToken: string,
  shopId: number,
  opts?: { limit?: number; offset?: number; min_created?: number; max_created?: number }
): Promise<ShopReceiptsResponse> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.min_created) params.set("min_created", String(opts.min_created));
  if (opts?.max_created) params.set("max_created", String(opts.max_created));
  const q = params.toString();
  return etsyApi<ShopReceiptsResponse>(
    `/shops/${shopId}/receipts${q ? `?${q}` : ""}`,
    accessToken
  );
}
