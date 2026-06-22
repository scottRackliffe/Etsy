import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "ETSY_AUTH_FAILED"
  | "ETSY_API_FAILED"
  | "ETSY_TOKEN_REVOKED"
  | "ETSY_TEMPORARILY_UNAVAILABLE"
  | "LISTING_GENERATION_FAILED"
  | "AI_NOT_CONFIGURED"
  | "LISTING_ANALYZE_FAILED"
  | "LISTING_COMPOSE_FAILED"
  | "LISTING_COACH_COMPLETE_FAILED"
  | "LISTING_IMPROVEMENT_FAILED"
  | "QUALITY_SCORE_TOO_LOW"
  | "INTERNAL_ERROR"
  | "SAMPLE_DATA_EXISTS"
  | "NO_SAMPLE_DATA"
  | "QUERY_TOO_SHORT"
  | "BATCH_TOO_LARGE"
  | "CONCURRENT_EDIT"
  | "DATABASE_BUSY"
  | "REFERENTIAL_INTEGRITY"
  | "PUBLISH_NOT_READY"
  | "FORBIDDEN"
  | "SHIPPING_NOT_CONFIGURED"
  | "ADDRESS_INVALID"
  | "INSUFFICIENT_FUNDS"
  | "LABEL_ALREADY_PURCHASED"
  | "VIDEO_GENERATION_FAILED"
  | "TAXONOMY_SYNC_FAILED"
  | "TAXONOMY_PROPERTIES_FAILED"
  | "DUPLICATE"
  | "ALREADY_PUBLISHED";

export type ApiErrorPayload = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    user_message: string;
    actions: string[];
    can_retry: boolean;
  };
  fields?: Record<string, string[]>;
};

export class ApiRouteError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly userMessage: string;
  readonly actions: string[];
  readonly canRetry: boolean;
  readonly fields?: Record<string, string[]>;

  constructor(params: {
    status: number;
    code: ApiErrorCode;
    message: string;
    userMessage: string;
    actions?: string[];
    canRetry?: boolean;
    fields?: Record<string, string[]>;
  }) {
    super(params.message);
    this.status = params.status;
    this.code = params.code;
    this.userMessage = params.userMessage;
    this.actions = params.actions ?? [];
    this.canRetry = params.canRetry ?? false;
    this.fields = params.fields;
  }
}

export function errorResponse(error: ApiRouteError): NextResponse<ApiErrorPayload> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        user_message: error.userMessage,
        actions: error.actions,
        can_retry: error.canRetry,
      },
      ...(error.fields ? { fields: error.fields } : {}),
    },
    { status: error.status }
  );
}

export function isDatabaseBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === "SQLITE_BUSY" || error.message.includes("SQLITE_BUSY");
}

export function fromUnknownError(
  error: unknown,
  fallback: {
    code: ApiErrorCode;
    message: string;
    userMessage: string;
    actions: string[];
    canRetry?: boolean;
    status?: number;
  }
): ApiRouteError {
  if (error instanceof ApiRouteError) {
    return error;
  }
  if (isDatabaseBusyError(error)) {
    return new ApiRouteError({
      status: 503,
      code: "DATABASE_BUSY",
      message: "Database is temporarily busy",
      userMessage: "The database is busy. Please try again in a moment.",
      actions: ["Wait a moment and try again."],
      canRetry: true,
    });
  }
  if (error instanceof Error) {
    return new ApiRouteError({
      status: fallback.status ?? 500,
      code: fallback.code,
      message: error.message,
      userMessage: fallback.userMessage,
      actions: fallback.actions,
      canRetry: fallback.canRetry ?? true,
    });
  }
  return new ApiRouteError({
    status: fallback.status ?? 500,
    code: fallback.code,
    message: fallback.message,
    userMessage: fallback.userMessage,
    actions: fallback.actions,
    canRetry: fallback.canRetry ?? true,
  });
}
