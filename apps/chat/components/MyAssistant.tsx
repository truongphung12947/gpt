"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  unstable_createLangGraphStream,
  useLangGraphRuntime,
  type LangChainMessage,
  type UIMessage,
} from "@assistant-ui/react-langgraph";
import { Claude } from "@/components/chatgpt/claude";
import { createClient } from "@/lib/chatApi";
import { createLangGraphThreadListAdapter } from "@/lib/threadListAdapter";
import { ModelProvider, useModel } from "@/components/model-context";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID ?? "agent";

export function MyAssistant() {
  return (
    <ModelProvider>
      <Assistant />
    </ModelProvider>
  );
}

function Assistant() {
  const client = useMemo(() => createClient(), []);
  const { getRunConfig } = useModel();
  const stream = useMemo(
    () =>
      unstable_createLangGraphStream({
        // Every run carries the model and thinking level picked in the composer.
        client: {
          runs: {
            stream: (threadId: string | null, assistantId, payload) =>
              client.runs.stream(threadId as string, assistantId, {
                ...payload,
                config: {
                  ...payload?.config,
                  configurable: {
                    ...payload?.config?.configurable,
                    ...getRunConfig(),
                  },
                },
              }),
          },
        },
        assistantId: ASSISTANT_ID,
      }),
    [client, getRunConfig],
  );

  const threadListAdapter = useMemo(
    () => createLangGraphThreadListAdapter(client),
    [client],
  );

  const runtime = useLangGraphRuntime({
    unstable_allowCancellation: true,
    unstable_threadListAdapter: threadListAdapter,
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
      <div className="h-dvh">
        <Claude />
      </div>
    </AssistantRuntimeProvider>
  );
}
