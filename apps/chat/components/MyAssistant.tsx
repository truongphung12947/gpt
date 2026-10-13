"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  unstable_createLangGraphStream,
  useLangGraphRuntime,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import { createClient } from "@/lib/chatApi";
import { createLangGraphThreadListAdapter } from "@/lib/threadListAdapter";

const ASSISTANT_ID = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID ?? "agent";

export function MyAssistant() {
  const client = useMemo(() => createClient(), []);
  const stream = useMemo(
    () => unstable_createLangGraphStream({ client, assistantId: ASSISTANT_ID }),
    [client],
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
      }>(externalId);
      return {
        messages: state.values.messages,
        interrupts: state.tasks[0]?.interrupts,
      };
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh">
        <aside className="hidden w-64 shrink-0 border-e p-2 md:block">
          <ThreadList />
        </aside>
        <main className="min-w-0 flex-1">
          <Thread />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
