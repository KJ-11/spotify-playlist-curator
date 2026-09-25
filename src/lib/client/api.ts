import type { ApiErrorBody, ErrorCode } from "@/lib/errors";

export class ClientApiError extends Error {
  constructor(
    public code: ErrorCode | "NETWORK",
    message: string
  ) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ClientApiError("NETWORK", "Couldn't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    const err = body?.error;
    if (err) throw new ClientApiError(err.code, err.message);
    if (res.status === 504) {
      throw new ClientApiError("INTERNAL", "That took too long and timed out. Try again.");
    }
    throw new ClientApiError("INTERNAL", `Unexpected server response (${res.status}).`);
  }
  return body;
}

export function toClientError(error: unknown): ClientApiError {
  return error instanceof ClientApiError
    ? error
    : new ClientApiError("INTERNAL", "Something went wrong. Try again.");
}
