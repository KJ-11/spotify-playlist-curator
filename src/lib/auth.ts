import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const scopes = [
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "playlist-modify-public",
  "playlist-modify-private",
  "ugc-image-upload",
].join(" ");

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Spotify({
      authorization: `https://accounts.spotify.com/authorize?scope=${encodeURIComponent(scopes)}`,
    }),
  ],
  // Send OAuth errors (e.g. user cancelled, not allowlisted) back to the landing page.
  pages: { error: "/" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }
      if (Date.now() < (token.expiresAt as number) * 1000) {
        return token;
      }
      if (!token.refreshToken) {
        return token;
      }
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.AUTH_SPOTIFY_ID}:${process.env.AUTH_SPOTIFY_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
        }),
      });
      if (!response.ok) {
        console.error(`Spotify token refresh failed: ${response.status}`);
        return { ...token, accessToken: undefined, error: "RefreshTokenError" as const };
      }
      const data = await response.json();
      return {
        ...token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? token.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        error: undefined,
      };
    },
    async session({ session, token }) {
      if (token.accessToken) {
        session.accessToken = token.accessToken;
      }
      session.error = token.error;
      return session;
    },
  },
});
