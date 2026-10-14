"use client";

import { useAuiState, type ThreadSuggestion } from "@assistant-ui/react";
import { useEffect, useRef, type FC } from "react";
import { useModel } from "@/components/model-context";

/**
 * Asks the graph for follow-up prompts once a reply has finished, and hands them to the
 * runtime's `suggestions` option, which the follow-up suggestions element then displays.
 * Generating them after the run (not inside it) keeps the answer from waiting on them.
 */
export const SuggestionsSync: FC<{ onChange: (suggestions: ThreadSuggestion[]) => void }> = ({
  onChange,
}) => {
  const { getRunConfig } = useModel();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const threadId = useAuiState((s) => s.threadListItem.externalId);
  // One string rather than an object: selectors must return stable values.
  const exchange = useAuiState((s) => {
    const text = (m?: { parts: readonly { type: string; text?: string }[] }) =>
      (m?.parts ?? [])
        .flatMap((p) => (p.type === "text" && p.text ? [p.text] : []))
        .join("\n");
    const messages = [...s.thread.messages].reverse();
    return JSON.stringify([
      text(messages.find((m) => m.role === "user")),
      text(messages.find((m) => m.role === "assistant")),
    ]);
  });

  // Read inside the effect without re-running it (and aborting the request) when it changes.
  const exchangeRef = useRef(exchange);
  useEffect(() => {
    exchangeRef.current = exchange;
  }, [exchange]);

  // A different thread starts with no suggestions.
  useEffect(() => {
    onChange([]);
  }, [threadId, onChange]);

  const wasRunning = useRef(false);
  useEffect(() => {
    if (isRunning) {
      wasRunning.current = true;
      onChange([]);
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;

    const [user, assistant] = JSON.parse(exchangeRef.current) as [string, string];
    if (!assistant.trim()) return;
    const controller = new AbortController();
    fetch("/api/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", text: user },
          { role: "assistant", text: assistant },
        ],
        model: getRunConfig().model,
      }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestions?: ThreadSuggestion[] } | null) => {
        if (d?.suggestions?.length) onChange(d.suggestions);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isRunning, onChange, getRunConfig]);

  return null;
};
