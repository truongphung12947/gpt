import { query } from "@/lib/db";

/** What the composer was set to in this chat: restored when the chat is opened again. */
export type ChatSettings = { model?: string; effort?: "low" | "medium" | "high"; webSearch?: boolean };

export type Chat = {
  thread_id: string;
  title: string | null;
  archived: boolean;
  updated_at: string;
  settings: ChatSettings;
};

const COLS = "thread_id, title, archived, updated_at, settings";

/** Keeps only known, well-typed fields from untrusted input. */
export const cleanSettings = (input: unknown): ChatSettings | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;
  const out: ChatSettings = {};
  if (typeof i.model === "string" && i.model.length > 0 && i.model.length <= 120) out.model = i.model;
  if (i.effort === "low" || i.effort === "medium" || i.effort === "high") out.effort = i.effort;
  if (typeof i.webSearch === "boolean") out.webSearch = i.webSearch;
  return out;
};

export const listChats = (owner: string) =>
  query<Chat>(
    `select ${COLS} from chats where owner = $1 order by updated_at desc limit 500`,
    [owner],
  );

export const getChat = async (owner: string, id: string) =>
  (await query<Chat>(`select ${COLS} from chats where owner = $1 and thread_id = $2`, [owner, id]))[0];

export const createChat = async (owner: string, id: string) =>
  (
    await query<Chat>(
      `insert into chats (thread_id, owner) values ($1, $2) returning ${COLS}`,
      [id, owner],
    )
  )[0]!;

export const updateChat = async (
  owner: string,
  id: string,
  patch: { title?: string; archived?: boolean; settings?: ChatSettings },
) =>
  (
    await query<Chat>(
      `update chats set title = coalesce($3, title), archived = coalesce($4, archived),
         settings = coalesce($5::jsonb, settings)
       where owner = $1 and thread_id = $2 returning ${COLS}`,
      [owner, id, patch.title ?? null, patch.archived ?? null, patch.settings ? JSON.stringify(patch.settings) : null],
    )
  )[0];

export const touchChat = (owner: string, id: string) =>
  query(`update chats set updated_at = now() where owner = $1 and thread_id = $2`, [owner, id]);

export const deleteChat = async (owner: string, id: string) =>
  (await query(`delete from chats where owner = $1 and thread_id = $2 returning thread_id`, [owner, id])).length > 0;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
