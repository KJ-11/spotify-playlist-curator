import { auth } from "./auth";
import { AppError } from "./api-error";

export async function requireAccessToken(): Promise<string> {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    throw new AppError("AUTH_EXPIRED", "Your Spotify session expired. Reconnect to continue.", 401);
  }
  return session.accessToken;
}
