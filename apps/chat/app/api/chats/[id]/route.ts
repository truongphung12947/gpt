import { auth } from "@/auth";
import { UUID, cleanSettings, deleteChat, getChat, updateChat } from "@/lib/chats";
import { graphFetch } from "@/lib/graph";

type Ctx = { params: Promise<{ id: string }> };

const guard = async (ctx: Ctx) => {
  const session = await auth();
  if (!session?.user?.id) return { error: Response.json({ detail: "Not signed in" }, { status: 401 }) };
  const { id } = await ctx.params;
  if (!UUID.test(id)) return { error: Response.json({ detail: "Not found" }, { status: 404 }) };
  return { user: session.user, id };
};

export const GET = async (_req: Request, ctx: Ctx) => {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const chat = await getChat(g.user.id, g.id);
  return chat ? Response.json({ chat }) : Response.json({ detail: "Not found" }, { status: 404 });
};

export const PATCH = async (req: Request, ctx: Ctx) => {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; archived?: unknown; settings?: unknown };
  const chat = await updateChat(g.user.id, g.id, {
    title: typeof body.title === "string" ? body.title.slice(0, 200) : undefined,
    archived: typeof body.archived === "boolean" ? body.archived : undefined,
    settings: cleanSettings(body.settings),
  });
  return chat ? Response.json({ chat }) : Response.json({ detail: "Not found" }, { status: 404 });
};

export const DELETE = async (_req: Request, ctx: Ctx) => {
  const g = await guard(ctx);
  if (g.error) return g.error;
  if (!(await deleteChat(g.user.id, g.id))) {
    return Response.json({ detail: "Not found" }, { status: 404 });
  }
  // Best effort: drop the graph's thread (and its checkpoints) too.
  await graphFetch(g.user, `/threads/${g.id}`, { method: "DELETE" }).catch(() => {});
  return Response.json({ ok: true });
};
