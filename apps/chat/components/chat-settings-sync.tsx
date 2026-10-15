"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useRef, type FC } from "react";
import { settingsKey as settingsKeyOf, useModel, type ChatSettings } from "@/components/model-context";

const save = (id: string, settings: ChatSettings) =>
  fetch(`/api/chats/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  }).catch(() => {});

/**
 * Keeps the composer's model, thinking level and Search switch per chat: opening a chat
 * restores what it was last set to; changing them while a chat is open saves them to it.
 * A chat with nothing stored yet (new, or from before this existed) adopts the current ones.
 */
export const ChatSettingsSync: FC = () => {
  const { settings, settingsKey, applySettings, models } = useModel();
  const threadId = useAuiState((s) => s.threadListItem.externalId);

  // Latest values for the effects below, without re-running them when these change.
  const latest = useRef({ settings, settingsKey });
  useEffect(() => {
    latest.current = { settings, settingsKey };
  });
  // The settings key the server has for the open chat; undefined until it has been loaded.
  const known = useRef<string | undefined>(undefined);
  const modelsReady = models.length > 0;

  // Opening a chat: restore its settings, or store the current ones if it has none.
  useEffect(() => {
    known.current = undefined;
    if (!threadId || !modelsReady) return;
    let cancelled = false;
    fetch(`/api/chats/${threadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { chat?: { settings?: ChatSettings } } | null) => {
        if (cancelled || !d?.chat) return;
        const stored = d.chat.settings ?? {};
        if (stored.model || stored.effort || typeof stored.webSearch === "boolean") {
          known.current = settingsKeyOf(applySettings(stored));
        } else {
          known.current = latest.current.settingsKey;
          void save(threadId, latest.current.settings);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId, modelsReady, applySettings]);

  // The user changed something while this chat is open.
  useEffect(() => {
    if (!threadId || known.current === undefined || settingsKey === known.current) return;
    const timer = setTimeout(() => {
      known.current = settingsKey;
      void save(threadId, latest.current.settings);
    }, 400);
    return () => clearTimeout(timer);
  }, [threadId, settingsKey]);

  return null;
};
