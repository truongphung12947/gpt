import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

type Chat = { thread_id: string; title: string | null; archived: boolean; updated_at: string };

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : ""))
      .join(" ");
  }
  return "";
};

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api/chats${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Chats request failed (${res.status})`);
  return res.json();
};

const toThread = (c: Chat) => ({
  status: c.archived ? ("archived" as const) : ("regular" as const),
  remoteId: c.thread_id,
  externalId: c.thread_id,
  title: c.title ?? undefined,
  lastMessageAt: new Date(c.updated_at),
});

const patch = (id: string, body: { title?: string; archived?: boolean }) =>
  api(`/${id}`, { method: "PATCH", body: JSON.stringify(body) });

/** Backs the assistant-ui thread list with the chats table in Postgres (via /api/chats). */
export const createChatsThreadListAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    const { chats } = await api<{ chats: Chat[] }>("");
    return { threads: chats.map(toThread) };
  },
  async initialize() {
    const { chat } = await api<{ chat: Chat }>("", { method: "POST" });
    return { remoteId: chat.thread_id, externalId: chat.thread_id };
  },
  async rename(remoteId, title) {
    await patch(remoteId, { title });
  },
  async archive(remoteId) {
    await patch(remoteId, { archived: true });
  },
  async unarchive(remoteId) {
    await patch(remoteId, { archived: false });
  },
  async delete(remoteId) {
    await api(`/${remoteId}`, { method: "DELETE" });
  },
  async fetch(threadId) {
    const { chat } = await api<{ chat: Chat }>(`/${threadId}`);
    return toThread(chat);
  },
  async generateTitle(remoteId, messages) {
    const first = messages.find((m) => m.role === "user");
    const raw = first
      ? first.content.map((p) => (p.type === "text" ? p.text : "")).join(" ")
      : "";
    const title = textOf(raw).trim().replace(/\s+/g, " ").slice(0, 48) || "New chat";
    await patch(remoteId, { title });
    return createAssistantStream((controller) => {
      controller.appendText(title);
      controller.close();
    });
  },
});
