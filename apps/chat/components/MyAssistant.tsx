"use client";

import { useMemo, useState } from "react";
import { AssistantRuntimeProvider, type ThreadSuggestion } from "@assistant-ui/react";
import {
  unstable_createLangGraphStream,
  useLangGraphRuntime,
  type LangChainMessage,
  type UIMessage,
} from "@assistant-ui/react-langgraph";
import { Claude } from "@/components/chatgpt/claude";
import { createClient } from "@/lib/chatApi";
import { fileAttachmentAdapter } from "@/lib/attachmentAdapter";
import { createChatsThreadListAdapter } from "@/lib/threadListAdapter";
import { ModelProvider, useModel } from "@/components/model-context";
import { RunErrorProvider, useRunError } from "@/components/run-error";
import { SuggestionsSync } from "@/components/suggestions-sync";
import { ChatSettingsSync } from "@/components/chat-settings-sync";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID ?? "agent";

export function MyAssistant() {
  return (
    <ModelProvider>
      <RunErrorProvider>
        <Assistant />
      </RunErrorProvider>
    </ModelProvider>
  );
}

function Assistant() {
  const client = useMemo(() => createClient(), []);
  const { getRunConfig } = useModel();
  const { report } = useRunError();
  const stream = useMemo(
    () =>
      unstable_createLangGraphStream({
        // Every run carries the model and thinking level picked in the composer.
        client: {
          runs: {
            stream: (threadId: string | null, assistantId, payload) => {
              const source = client.runs.stream(threadId as string, assistantId, {
                ...payload,
                config: {
                  ...payload?.config,
                  configurable: {
                    ...payload?.config?.configurable,
                    ...getRunConfig(),
                  },
                },
              });
              // A request that fails outright (server unreachable) would otherwise end silently:
              // show it in the error banner and finish the run cleanly.
              return (async function* () {
                try {
                  yield* source;
                } catch (error) {
                  if (payload?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return;
                  report(error, "transport");
                }
              })() as typeof source;
            },
          },
        },
        assistantId: ASSISTANT_ID,
      }),
    [client, getRunConfig, report],
  );

  const threadListAdapter = useMemo(() => createChatsThreadListAdapter(), []);

  const [suggestions, setSuggestions] = useState<ThreadSuggestion[]>([]);

  const runtime = useLangGraphRuntime({
    unstable_allowCancellation: true,
    suggestions,
    eventHandlers: { onError: report },
    // Lets the runtime fork the thread from an earlier message, which regenerating a reply,
    // editing a message and retrying a failed run all need.
    getCheckpointId: async (threadId, parentMessages) => {
      const last = parentMessages.at(-1);
      if (!last?.id) return null;
      const history = await client.threads.getHistory<{ messages: LangChainMessage[] }>(threadId);
      const state = history.find((s) => s.values.messages?.at(-1)?.id === last.id);
      return state?.checkpoint.checkpoint_id ?? null;
    },
    unstable_threadListAdapter: threadListAdapter,
    adapters: { attachments: fileAttachmentAdapter },
    stream,
    load: async (externalId) => {
      const state = await client.threads.getState<{
        messages: LangChainMessage[];
        ui?: UIMessage[];
      }>(externalId);
      return {
        messages: state.values.messages,
        uiMessages: state.values.ui,
        interrupts: state.tasks[0]?.interrupts,
      };
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SuggestionsSync onChange={setSuggestions} />
      <ChatSettingsSync />
      <div className="h-dvh">
        <Claude />
      </div>
    </AssistantRuntimeProvider>
  );
}
