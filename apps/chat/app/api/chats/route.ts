import { auth } from "@/auth";
import { createChat, listChats } from "@/lib/chats";
import { ensureGraphThread } from "@/lib/graph";

// The chat list lives in Postgres (durable); the graph only runs conversations.
export const GET = async () => {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ detail: "Not signed in" }, { status: 401 });
  return Response.json({ chats: await listChats(session.user.id) });
};

export const POST = async () => {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ detail: "Not signed in" }, { status: 401 });
  const id = crypto.randomUUID();
  const chat = await createChat(session.user.id, id);
  await ensureGraphThread(session.user, id);
  return Response.json({ chat });
};
