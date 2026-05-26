/**
 * Etsy Open API v3 – OAuth helpers and API client
 * Docs: https://developer.etsy.com/documentation/
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ETSY_OAUTH_BASE = "https://www.etsy.com/oauth";
const ETSY_API_BASE = "https://api.etsy.com/v3/application";
const FORM_URLENCODED_UTF8 = "application/x-www-form-urlencoded; charset=utf-8";

/**
 * Build the x-api-key header value per Etsy's spec: "clientId:sharedSecret".
 * Falls back to ETSY_API_KEY_HEADER env var if explicitly set (for testing overrides).
 */
function getApiKeyHeader(): string {
  const override = process.env.ETSY_API_KEY_HEADER;
  if (override) return override;
  const { clientId, clientSecret } = getEtsyConfig();
  return `${clientId}:${clientSecret}`;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

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
  const bytes = crypto.randomBytes(56);
  return base64UrlEncode(new Uint8Array(bytes));
}

/** SHA256 + base64url of code_verifier for code_challenge */
export async function getCodeChallenge(verifier: string): Promise<string> {
  const buf = crypto.createHash("sha256").update(verifier, "utf8").digest();
  return base64UrlEncode(new Uint8Array(buf));
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build Etsy OAuth authorization URL (PKCE) */
export async function getEtsyAuthUrl(
  state: string
): Promise<{ url: string; codeVerifier: string }> {
  const { clientId, redirectUri } = getEtsyConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await getCodeChallenge(codeVerifier);
  const scope = "transactions_r receipts_r shops_r listings_r listings_w";
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
  const { clientId, redirectUri } = getEtsyConfig();
  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": FORM_URLENCODED_UTF8,
      "x-api-key": getApiKeyHeader(),
    },
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

export type RefreshResult = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export class EtsyRefreshError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  readonly body: string;

  constructor(status: number, body: string, retryAfter: number | null) {
    super(`Etsy token refresh failed: ${status}`);
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }

  get isRevoked(): boolean {
    return this.status === 400 || this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  timeoutMs?: number
): Promise<RefreshResult> {
  const { clientId } = getEtsyConfig();
  const controller = new AbortController();
  const timeout = timeoutMs ?? (Number(process.env.ETSY_TOKEN_TIMEOUT_MS) || 15_000);
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": FORM_URLENCODED_UTF8,
        "x-api-key": getApiKeyHeader(),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) || null : null;
      throw new EtsyRefreshError(res.status, text, retryAfter);
    }
    return (await res.json()) as RefreshResult;
  } finally {
    clearTimeout(timer);
  }
}

export class EtsyApiError extends Error {
  readonly status: number;
  constructor(path: string, status: number, body: string) {
    super(`Etsy API ${path}: ${status} ${body}`);
    this.status = status;
  }
}

const BEARER_TOKEN_RE = /^\d+\..+/;

/**
 * Validate that an access token matches Etsy's required "userId.token" format.
 * Etsy's OAuth endpoint returns tokens in this shape; this guard catches
 * corruption or storage bugs before they produce cryptic 401s.
 */
function assertBearerFormat(accessToken: string): void {
  if (!BEARER_TOKEN_RE.test(accessToken)) {
    throw new Error(
      "Etsy access token does not match the required userId.token format. " +
        "Re-authenticate with Etsy to obtain a valid token."
    );
  }
}

/** Etsy API request with API key + Bearer token */
export async function etsyApi<T>(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  assertBearerFormat(accessToken);
  const timeout = Number(process.env.ETSY_API_TIMEOUT_MS) || 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${ETSY_API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "x-api-key": getApiKeyHeader(),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new EtsyApiError(path, res.status, text);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function createDraftListing(
  accessToken: string,
  params: {
    shopId: number;
    title: string;
    description: string;
    price: number;
    quantity: number;
    taxonomyId: number;
    whoMade: string;
    whenMade: string;
    shippingProfileId: number;
    readinessStateId: number;
    imageIds?: number[];
    tags: string[];
  }
): Promise<{ listing_id: number; state?: string }> {
  assertBearerFormat(accessToken);
  const form = new URLSearchParams();
  form.set("quantity", String(params.quantity));
  form.set("title", params.title);
  form.set("description", params.description);
  form.set("price", String(params.price));
  form.set("who_made", params.whoMade);
  form.set("when_made", params.whenMade);
  form.set("taxonomy_id", String(params.taxonomyId));
  form.set("shipping_profile_id", String(params.shippingProfileId));
  form.set("readiness_state_id", String(params.readinessStateId));
  if (params.imageIds && params.imageIds.length > 0) {
    form.set("image_ids", params.imageIds.join(","));
  }
  for (const tag of params.tags.slice(0, 13)) {
    form.append("tags[]", tag);
  }

  const res = await fetch(`${ETSY_API_BASE}/shops/${params.shopId}/listings`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKeyHeader(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": FORM_URLENCODED_UTF8,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy createDraftListing failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { listing_id: number; state?: string };
}

async function toUploadBlob(reference: string): Promise<{ blob: Blob; filename: string }> {
  if (/^https?:\/\//i.test(reference)) {
    const res = await fetch(reference);
    if (!res.ok) {
      throw new Error(`Failed to fetch image URL for upload: ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const ext = contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("gif")
          ? ".gif"
          : ".jpg";
    return {
      blob: new Blob([arrayBuffer], { type: contentType }),
      filename: `listing-image${ext}`,
    };
  }
  const absolute = path.isAbsolute(reference) ? reference : path.join(process.cwd(), reference);
  const buffer = await fs.readFile(absolute);
  const ext = path.extname(absolute).toLowerCase() || ".jpg";
  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return {
    blob: new Blob([toArrayBuffer(buffer)], { type: mimeType }),
    filename: path.basename(absolute),
  };
}

async function optimizeImageForUpload(
  input: { buffer: Buffer; mimeType: string; filename: string },
  options?: { maxDimension?: number; targetDensityDpi?: number; jpegQuality?: number }
): Promise<{ blob: Blob; filename: string }> {
  const maxDimension = Math.max(512, Math.floor(options?.maxDimension ?? 2000));
  const targetDensityDpi = Math.max(72, Math.floor(options?.targetDensityDpi ?? 300));
  const jpegQuality = Math.max(40, Math.min(95, Math.floor(options?.jpegQuality ?? 82)));

  try {
    const pipeline = sharp(input.buffer).rotate().resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (input.mimeType === "image/png") {
      const output = await pipeline
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .withMetadata({ density: targetDensityDpi })
        .toBuffer();
      return {
        blob: new Blob([toArrayBuffer(output)], { type: "image/png" }),
        filename: input.filename.replace(/\.[^.]+$/, ".png"),
      };
    }

    if (input.mimeType === "image/webp") {
      const output = await pipeline
        .webp({ quality: jpegQuality })
        .withMetadata({ density: targetDensityDpi })
        .toBuffer();
      return {
        blob: new Blob([toArrayBuffer(output)], { type: "image/webp" }),
        filename: input.filename.replace(/\.[^.]+$/, ".webp"),
      };
    }

    const output = await pipeline
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .withMetadata({ density: targetDensityDpi })
      .toBuffer();
    return {
      blob: new Blob([toArrayBuffer(output)], { type: "image/jpeg" }),
      filename: input.filename.replace(/\.[^.]+$/, ".jpg"),
    };
  } catch {
    // If optimization fails for any source image, fall back to original bytes.
    return {
      blob: new Blob([toArrayBuffer(input.buffer)], { type: input.mimeType }),
      filename: input.filename,
    };
  }
}

export async function uploadListingImageFromReference(
  accessToken: string,
  params: {
    shopId: number;
    listingId: number;
    reference: string;
    transform?: {
      maxDimension?: number;
      targetDensityDpi?: number;
      jpegQuality?: number;
    };
  }
): Promise<void> {
  assertBearerFormat(accessToken);
  const original = await toUploadBlob(params.reference);
  const originalArrayBuffer = await original.blob.arrayBuffer();
  const optimized = await optimizeImageForUpload(
    {
      buffer: Buffer.from(originalArrayBuffer),
      mimeType: original.blob.type || "image/jpeg",
      filename: original.filename,
    },
    params.transform
  );
  const formData = new FormData();
  formData.append("image", optimized.blob, optimized.filename);

  const res = await fetch(
    `${ETSY_API_BASE}/shops/${params.shopId}/listings/${params.listingId}/images`,
    {
      method: "POST",
      headers: {
        "x-api-key": getApiKeyHeader(),
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy uploadListingImage failed: ${res.status} ${text}`);
  }
}

export async function updateListingDetails(
  accessToken: string,
  params: {
    shopId: number;
    listingId: number;
    title: string;
    description: string;
    price: number;
    quantity: number;
    taxonomyId: number;
    whoMade: string;
    whenMade: string;
    tags: string[];
  }
): Promise<void> {
  assertBearerFormat(accessToken);
  const form = new URLSearchParams();
  form.set("title", params.title);
  form.set("description", params.description);
  form.set("price", String(params.price));
  form.set("quantity", String(params.quantity));
  form.set("taxonomy_id", String(params.taxonomyId));
  form.set("who_made", params.whoMade);
  form.set("when_made", params.whenMade);
  for (const tag of params.tags.slice(0, 13)) {
    form.append("tags[]", tag);
  }
  const res = await fetch(`${ETSY_API_BASE}/shops/${params.shopId}/listings/${params.listingId}`, {
    method: "PATCH",
    headers: {
      "x-api-key": getApiKeyHeader(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": FORM_URLENCODED_UTF8,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy updateListing details failed: ${res.status} ${text}`);
  }
}

export async function updateListingState(
  accessToken: string,
  params: { shopId: number; listingId: number; state: "active" | "draft" | "inactive" }
): Promise<void> {
  assertBearerFormat(accessToken);
  const form = new URLSearchParams();
  form.set("state", params.state);
  const res = await fetch(`${ETSY_API_BASE}/shops/${params.shopId}/listings/${params.listingId}`, {
    method: "PATCH",
    headers: {
      "x-api-key": getApiKeyHeader(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": FORM_URLENCODED_UTF8,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy updateListing state failed: ${res.status} ${text}`);
  }
}

/** Get current user's shops (need user ID from /users/me first; v3 uses shop_id) */
export async function getShops(
  accessToken: string
): Promise<{ shop_id: number; shop_name: string }[]> {
  type Me = { user_id: string };
  const me = await etsyApi<Me>("/users/me", accessToken);
  type Shops = { results: { shop_id: number; shop_name: string }[] };
  const shops = await etsyApi<Shops>(`/users/${me.user_id}/shops`, accessToken);
  return shops.results ?? [];
}

/** Get shop receipts (orders) – paginated */
export type ReceiptTransaction = {
  transaction_id: number;
  listing_id: number;
  title: string;
  quantity: number;
  price: { amount: number; divisor: number; currency_code: string };
  shipping_cost: { amount: number; divisor: number; currency_code: string } | null;
};

export type Receipt = {
  receipt_id: number;
  receipt_type: number;
  order_id: number;
  seller_user_id: number;
  buyer_user_id: number;
  buyer_email: string | null;
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
  total_tax_cost: { amount: number; divisor: number; currency_code: string } | string;
  total_vat_cost: { amount: number; divisor: number; currency_code: string } | string;
  total_price: { amount: number; divisor: number; currency_code: string } | string;
  total_shipping_cost: { amount: number; divisor: number; currency_code: string } | string;
  currency_code: string;
  message_from_seller: string | null;
  message_from_buyer: string | null;
  was_digital: boolean;
  needs_gift_wrap: boolean;
  is_gift_wrap: boolean;
  transactions: ReceiptTransaction[];
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
  return etsyApi<ShopReceiptsResponse>(`/shops/${shopId}/receipts${q ? `?${q}` : ""}`, accessToken);
}
