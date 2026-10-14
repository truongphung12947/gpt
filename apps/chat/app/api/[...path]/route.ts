import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { signGraphToken } from "@/lib/graphToken";
import { UUID, getChat, touchChat } from "@/lib/chats";
import { ensureGraphThread } from "@/lib/graph";

// Streams the request to the internal LangGraph server on behalf of the signed-in user.
// The graph only trusts the signed token added here and scopes every thread to its owner.
const SKIP_REQUEST = new Set(["host", "cookie", "authorization", "connection", "content-length"]);
const SKIP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

const handler = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ detail: "Not signed in" }, { status: 401 });
  }
  const base = process.env.LANGGRAPH_INTERNAL_URL;
  if (!base) return Response.json({ detail: "Graph URL not configured" }, { status: 500 });

  const { path } = await ctx.params;

  // Chats are created and listed through /api/chats (Postgres). Only conversations that
  // exist there are served, and the graph's thread record is recreated if it was lost.
  if (path[0] === "threads") {
    const id = path[1];
    if (!id || !UUID.test(id)) {
      return Response.json({ detail: "Use /api/chats" }, { status: 404 });
    }
    if (!(await getChat(session.user.id, id))) {
      return Response.json({ detail: "Not found" }, { status: 404 });
    }
    await ensureGraphThread(session.user, id);
    if (req.method === "POST" && path[2] === "runs") {
      void touchChat(session.user.id, id).catch(() => {});
    }
  }
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!SKIP_REQUEST.has(k.toLowerCase())) headers.set(k, v);
  });
  headers.set("authorization", `Bearer ${signGraphToken(session.user.id, session.user.email)}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(`${base}/${path.join("/")}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error required by undici for streamed request bodies
    duplex: "half",
    signal: req.signal,
    redirect: "manual",
  });

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!SKIP_RESPONSE.has(k.toLowerCase())) out.set(k, v);
  });
  return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
