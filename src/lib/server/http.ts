import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { AppError, type ApiErrorBody } from "@/lib/errors";

/** Converts any thrown value into a JSON error response, logging anything unexpected. */
export function errorResponse(error: unknown, context: string): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`${context}:`, error);
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error(`${context}:`, error);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong on our side." } },
    { status: 500 }
  );
}

/** Parses and validates a JSON request body, throwing a 400 AppError on bad input. */
export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const json = await req.json().catch(() => {
    throw new AppError("BAD_REQUEST", "Request body must be JSON.", 400);
  });
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new AppError("BAD_REQUEST", `Invalid request${where}: ${issue?.message ?? "bad input"}`, 400);
  }
  return result.data;
}

/** Best-effort client IP for rate limiting. Vercel sets x-forwarded-for. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
