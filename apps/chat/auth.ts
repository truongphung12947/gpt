import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyUser } from "@/lib/passwords";

// Email + password for the people listed in AUTH_USERS (see lib/passwords.ts).
// Microsoft Entra ID sign-in is planned for later (see CLAUDE.md).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize(c) {
        const email = verifyUser(String(c?.email ?? ""), String(c?.password ?? ""));
        return email ? { id: email, email } : null;
      },
    }),
  ],
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = String(token.uid ?? token.sub);
      return session;
    },
  },
});
