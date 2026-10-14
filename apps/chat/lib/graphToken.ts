import { createHmac } from "node:crypto";

/** Short-lived signed token the graph checks (GRAPH_AUTH_SECRET is shared with it). */
export const signGraphToken = (userId: string, email?: string | null) => {
  const secret = process.env.GRAPH_AUTH_SECRET;
  if (!secret) throw new Error("GRAPH_AUTH_SECRET is not set");
  const body = Buffer.from(
    JSON.stringify({ sub: userId, email: email ?? null, exp: Math.floor(Date.now() / 1000) + 300 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};
