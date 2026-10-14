import type { Client } from "@langchain/langgraph-sdk";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

const PAGE_SIZE = 100;
const MAX_THREADS = 500;

type Meta = { title?: string; archived?: boolean };

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : ""))
      .join(" ");
  }
  return "";
};

/** Backs the assistant-ui thread list with LangGraph's own thread store. */
export const createLangGraphThreadListAdapter = (
  client: Client,
): RemoteThreadListAdapter => {
  const setMeta = (id: string, patch: Meta) =>
    client.threads.update(id, { metadata: patch });

  return {
    async list() {
      // The sidebar has no "load more", so fetch every page (capped) up front.
      const rows: Awaited<ReturnType<typeof client.threads.search>> = [];
      for (let offset = 0; offset < MAX_THREADS; offset += PAGE_SIZE) {
        const page = await client.threads.search({
          limit: PAGE_SIZE,
          offset,
          sortBy: "updated_at",
          sortOrder: "desc",
        });
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return {
        threads: rows.map((t) => {
          const meta = (t.metadata ?? {}) as Meta;
          return {
            status: meta.archived ? ("archived" as const) : ("regular" as const),
            remoteId: t.thread_id,
            externalId: t.thread_id,
            title: meta.title,
            lastMessageAt: new Date(t.updated_at),
          };
        }),
      };
    },
    async initialize() {
      const { thread_id } = await client.threads.create();
      return { remoteId: thread_id, externalId: thread_id };
    },
    async rename(remoteId, title) {
      await setMeta(remoteId, { title });
    },
    async archive(remoteId) {
      await setMeta(remoteId, { archived: true });
    },
    async unarchive(remoteId) {
      await setMeta(remoteId, { archived: false });
    },
    async delete(remoteId) {
      await client.threads.delete(remoteId);
    },
    async fetch(threadId) {
      const t = await client.threads.get(threadId);
      const meta = (t.metadata ?? {}) as Meta;
      return {
        status: meta.archived ? "archived" : "regular",
        remoteId: t.thread_id,
        externalId: t.thread_id,
        title: meta.title,
        lastMessageAt: new Date(t.updated_at),
      };
    },
    async generateTitle(remoteId, messages) {
      const first = messages.find((m) => m.role === "user");
      const raw = first
        ? first.content.map((p) => (p.type === "text" ? p.text : "")).join(" ")
        : "";
      const title = (textOf(raw).trim().replace(/\s+/g, " ").slice(0, 48)) || "New chat";
      await setMeta(remoteId, { title });
      return createAssistantStream((controller) => {
        controller.appendText(title);
        controller.close();
      });
    },
  };
};
