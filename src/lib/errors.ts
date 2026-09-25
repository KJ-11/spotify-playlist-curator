export type ErrorCode =
  | "AUTH_EXPIRED"
  | "NOT_ALLOWLISTED"
  | "SPOTIFY_ERROR"
  | "EMPTY_LIBRARY"
  | "CURATION_FAILED"
  | "CURATOR_MISCONFIGURED"
  | "CURATION_DISABLED"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

/** An error that is safe to show to the user; `code` tells the client how to recover. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}
