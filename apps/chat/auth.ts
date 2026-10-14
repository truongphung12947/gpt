import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Lower-cased emails / sign-in names allowed to use the app (ALLOWED_EMAILS, comma separated). */
const allowList = () =>
  (process.env.ALLOWED_EMAILS ?? "")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Credentials come from AUTH_MICROSOFT_ENTRA_ID_ID / _SECRET / _ISSUER and AUTH_SECRET.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile, user }) {
      const names = [profile?.email, profile?.preferred_username, user?.email]
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.toLowerCase());
      const allowed = allowList();
      return names.some((n) => allowed.includes(n)) || "/signin?error=AccessDenied";
    },
    jwt({ token, profile }) {
      // `oid` is stable per user within the tenant; it is the owner id of their chats.
      if (profile) token.uid = String(profile.oid ?? profile.sub ?? token.sub);
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = String(token.uid ?? token.sub);
      return session;
    },
  },
});
