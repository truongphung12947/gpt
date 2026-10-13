"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useMemo, useState, type FC } from "react";
import { ComposerContext } from "@/components/assistant-ui/elements/composer";
import { useModel } from "@/components/model-context";
import { createClient } from "@/lib/chatApi";

type Measured = { threadId: string; tokens: number };

/**
 * Tokens the thread currently occupies. The runtime does not expose usage, so after each
 * run finishes we read it from the thread state: the latest reply's total (input + output)
 * already covers the whole conversation up to that point.
 */
function useThreadTokens(): number {
  const threadId = useAuiState((s) => s.threadListItem.externalId);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const client = useMemo(() => createClient(), []);
  const [measured, setMeasured] = useState<Measured | null>(null);

  useEffect(() => {
    if (!threadId || isRunning) return;
    let cancelled = false;
    client.threads
      .getState<{ messages: { type: string; usage_metadata?: { total_tokens?: number } }[] }>(threadId)
      .then((state) => {
        if (cancelled) return;
        const lastAi = [...(state.values.messages ?? [])]
          .reverse()
          .find((m) => m.type === "ai" && m.usage_metadata?.total_tokens);
        setMeasured({ threadId, tokens: lastAi?.usage_metadata?.total_tokens ?? 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, threadId, isRunning]);

  // A different (or new) thread shows nothing until its own measurement arrives.
  return measured && measured.threadId === threadId ? measured.tokens : 0;
}

const toK = (tokens: number) => Math.round(tokens / 100) / 10;

/** Ring in the composer rail: how much of the selected model's context window is used. */
export const ContextRing: FC = () => {
  const { models, selected } = useModel();
  const tokens = useThreadTokens();
  const window = models.find((m) => m.id === selected)?.context_window;
  if (!window) return null;

  return (
    <ComposerContext
      usage={{ system: 0, tools: 0, messages: toK(tokens), total: Math.round(window / 1000) }}
    />
  );
};
