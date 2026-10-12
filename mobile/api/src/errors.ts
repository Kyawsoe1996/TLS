import type { ApiError } from "../../shared/types";

export type ApiErrorCode = ApiError["error"]["code"];
export type ApiErrorStatus = 400 | 401 | 403 | 404 | 413 | 429 | 500 | 502;

/** Throw anywhere in a handler; index.ts maps it to an ApiError JSON response. */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: ApiErrorStatus,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }

  toBody(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}

export const unauthorized = (message = "You need to be signed in to do that.") =>
  new ApiHttpError(401, "unauthorized", message);

export const notFound = (message = "Not found.") => new ApiHttpError(404, "not_found", message);

export const badRequest = (message: string) => new ApiHttpError(400, "bad_request", message);

/** 413 for media uploads over the size limit. Uses code `bad_request` so the app needs no extra error code. */
export const payloadTooLarge = (message = "Photos up to 10 MB, videos up to 60 MB.") =>
  new ApiHttpError(413, "bad_request", message);

/** 403 for /ai/* until the owner has agreed to the AI data sharing (POST /shop/ai-consent). */
export const consentRequired = () =>
  new ApiHttpError(403, "consent_required", "Agree to sharing details with Google Gemini first.");

export const rateLimited = (message = "You've reached today's AI limit. Try again tomorrow.") =>
  new ApiHttpError(429, "rate_limited", message);

export const aiFailed = () =>
  new ApiHttpError(502, "ai_failed", "The AI couldn't produce a result. Please try again.");

export const serverError = (message = "Something went wrong. Please try again.") =>
  new ApiHttpError(500, "server_error", message);
