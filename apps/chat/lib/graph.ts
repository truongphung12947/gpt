import { signGraphToken } from "@/lib/graphToken";

export type GraphUser = { id: string; email?: string | null };

export const graphFetch = (user: GraphUser, path: string, init: RequestInit = {}) => {
  const base = process.env.LANGGRAPH_INTERNAL_URL;
  if (!base) throw new Error("LANGGRAPH_INTERNAL_URL is not set");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${signGraphToken(user.id, user.email)}`);
  return fetch(`${base}${path}`, { ...init, headers });
};

/**
 * The graph keeps its thread records in memory, so after a restart or deploy it no longer
 * knows a chat whose messages are safe in Postgres. Recreate the record (with `graph_id`,
 * which makes state/history read from the Postgres checkpointer). Only call this for a chat
 * the user owns according to the chats table.
 */
export const ensureGraphThread = async (user: GraphUser, id: string) => {
  const found = await graphFetch(user, `/threads/${id}`);
  if (found.ok) return;
  if (found.status !== 404) throw new Error(`Graph thread lookup failed (${found.status})`);
  const created = await graphFetch(user, "/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thread_id: id, if_exists: "do_nothing", metadata: { graph_id: "agent" } }),
  });
  if (!created.ok) throw new Error(`Graph thread create failed (${created.status})`);
};
