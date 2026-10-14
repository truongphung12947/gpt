import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// AUTH_USERS = "email:saltHex:hashHex,email2:saltHex:hashHex" (scrypt, N=16384). Create entries
// with `node scripts/hash-password.mjs`.
type User = { email: string; salt: Buffer; hash: Buffer };

const users = (): User[] =>
  (process.env.AUTH_USERS ?? "")
    .split(",")
    .map((e) => e.trim().split(":"))
    .filter((p) => p.length === 3 && p.every(Boolean))
    .map(([email, salt, hash]) => ({
      email: email.toLowerCase(),
      salt: Buffer.from(salt, "hex"),
      hash: Buffer.from(hash, "hex"),
    }));

/** Returns the lower-cased email when the credentials match a listed user, else null. */
export const verifyUser = (email: string, password: string): string | null => {
  const wanted = email.trim().toLowerCase();
  const user = users().find((u) => u.email === wanted);
  // Always run scrypt so unknown users cost the same time as wrong passwords.
  const salt = user?.salt ?? randomBytes(16);
  const got = scryptSync(password, salt, 32);
  const want = user?.hash ?? Buffer.alloc(32);
  const ok = want.length === got.length && timingSafeEqual(got, want);
  return user && ok ? user.email : null;
};
