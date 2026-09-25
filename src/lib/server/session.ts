import "server-only";
import { auth } from "./auth";
import { AppError } from "@/lib/errors";

/** Returns the Spotify access token for a healthy session, or null if signed out / expired. */
export async function getAccessToken(): Promise<string | null> {
  const session = await auth();
  return session?.accessToken && !session.error ? session.accessToken : null;
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new AppError("AUTH_EXPIRED", "Your Spotify session expired. Reconnect to continue.", 401);
  }
  return token;
}
