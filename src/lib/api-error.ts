import { NextResponse } from "next/server";

export type ErrorCode =
  | "AUTH_EXPIRED"
  | "NOT_ALLOWLISTED"
  | "SPOTIFY_ERROR"
  | "EMPTY_LIBRARY"
  | "CURATION_FAILED"
  | "BAD_REQUEST"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 500
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown, context: string) {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`${context}:`, error);
    return NextResponse.json<ApiErrorBody>(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error(`${context}:`, error);
  return NextResponse.json<ApiErrorBody>(
    { error: { code: "INTERNAL", message: "Something went wrong on our side." } },
    { status: 500 }
  );
}
