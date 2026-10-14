"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowUpIcon,
  AudioLines,
  Calendar as CalendarIcon,
  CheckIcon,
  Globe,
  ClipboardIcon,
  Code as CodeIcon,
  FolderOpen,
  GraduationCap,
  PencilIcon,
  PenLine,
  PlusIcon,
  RefreshCwIcon,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  XIcon,
} from "lucide-react";
import { useMemo, type FC } from "react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning.aui";
import {
  StreamingText,
  type Segment,
} from "@/components/assistant-ui/elements/streaming-text";
import { RunErrorBanner } from "@/components/run-error";
import { ErrorState } from "@/components/assistant-ui/elements/error-state";
import { ThreadFollowupSuggestions } from "@/components/assistant-ui/elements/follow-up-suggestions.aui";
import { ComposerAttachmentChip } from "@/components/assistant-ui/elements/composer";
import { useMessageError } from "@assistant-ui/core/react";
import { WebSearch } from "@/components/assistant-ui/elements/web-search";
import { TypingIndicator } from "@/components/assistant-ui/elements/typing-indicator";
import { cn } from "@/lib/utils";
import { ContextRing } from "@/components/context-usage";
import { formatBytes } from "@/lib/attachmentAdapter";
import { useModel } from "@/components/model-context";
import {
  formatContextWindow,
  formatModelName,
  modelIcon,
} from "@/components/model-meta";
import {
  ModelSelectorContent,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  type ModelOption,
} from "@/components/assistant-ui/elements/model-selector";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import { CloneThreadShell } from "./clone-thread-shell";

const messageActionButtonClassName =
  "flex size-8 items-center justify-center rounded-md text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/5 dark:hover:text-[#ececec]";

export const Claude: FC = () => {
  return (
    <CloneThreadShell>
      <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-white text-[#0d0d0d] dark:bg-black dark:text-[#ececec]">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <EmptyState />
        </AuiIf>

        <AuiIf condition={(s) => !s.thread.isEmpty}>
          <ThreadPrimitive.Viewport className="flex grow flex-col overflow-y-auto px-4 pt-12">
            <ThreadPrimitive.Messages>
              {() => <ChatMessage />}
            </ThreadPrimitive.Messages>
            <AssistantTyping />
            <RunErrorBanner />
            {/* Part of the scrolling content (under the last reply), not the sticky footer,
                so it scrolls with the conversation and never covers the text. */}
            <div className="mx-auto w-full max-w-3xl pt-2 pb-6 empty:hidden">
              <ThreadFollowupSuggestions />
            </div>

            <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto w-full max-w-3xl bg-linear-to-b from-transparent via-white/85 to-white pt-4 pb-2 dark:via-black/85 dark:to-black">
              <Composer />
              <p className="pt-2 text-center text-xs text-[#5d5d5d] dark:text-[#afafaf]">
                AI can make mistakes. Please double-check responses.
              </p>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </AuiIf>
      </ThreadPrimitive.Root>
    </CloneThreadShell>
  );
};

const EmptyState: FC = () => {
  return (
    <div className="flex grow flex-col items-center justify-center px-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-5">
        <p className="flex items-center justify-center gap-3 text-3xl text-[#0d0d0d] sm:text-4xl dark:text-[#ececec]">
          <Sparkle className="size-7 fill-[#0d0d0d] text-[#0d0d0d] dark:fill-white dark:text-white" />
          <span>How can I help you today?</span>
        </p>
        <Composer />
        <ModeTabs />
      </div>
    </div>
  );
};

const Composer: FC = () => {
  const hasRejectedFile = useAuiState((s) =>
    s.composer.attachments.some((a) => a.status.type === "incomplete"),
  );
  return (
    <ComposerPrimitive.AttachmentDropzone asChild>
    <ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-[28px] border border-[#e5e5e5] bg-white px-3.5 pt-3 pb-2.5 focus-within:border-[#d0d0d0] data-[dragging=true]:border-dashed data-[dragging=true]:border-blue-500/60 data-[dragging=true]:bg-blue-500/[0.04] dark:border-transparent dark:bg-[#212121] dark:focus-within:border-transparent">
      {/* Staged files sit above the text box, like the assistant-ui composer example. */}
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="flex flex-row flex-wrap gap-2">
          <ComposerPrimitive.Attachments>
            {() => <ClaudeAttachment />}
          </ComposerPrimitive.Attachments>
        </div>
      </AuiIf>
      <ComposerPrimitive.Input
        placeholder="How can I help you today?"
        rows={1}
        // Enter must not send while a rejected file is staged; the user removes it first.
        onKeyDown={(e) => {
          if (hasRejectedFile && e.key === "Enter") e.preventDefault();
        }}
        className="block max-h-72 min-h-6 w-full resize-none bg-transparent text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e] dark:text-[#ececec] dark:placeholder:text-[#8e8e8e]"
      />

      <div className="flex w-full items-center gap-2">
        <ComposerPrimitive.AddAttachment
          aria-label="Add attachment"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/5 dark:hover:text-[#ececec]"
        >
          <PlusIcon width={16} height={16} />
        </ComposerPrimitive.AddAttachment>

        <SearchToggle />

        <div className="ml-auto flex items-center gap-1">
          <ModelPicker />
          <ContextRing />
          <ComposerPrimaryAction />
        </div>
      </div>

    </ComposerPrimitive.Root>
    </ComposerPrimitive.AttachmentDropzone>
  );
};

const ComposerPrimaryAction: FC = () => {
  const hasRejectedFile = useAuiState((s) =>
    s.composer.attachments.some((a) => a.status.type === "incomplete"),
  );
  return (
    <>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel className="flex size-8 items-center justify-center rounded-md bg-[#0d0d0d] text-white transition-colors hover:bg-[#2a2a2a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5]">
          <div className="size-2.5 rounded-[2px] bg-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>

      <AuiIf
        condition={(s) => !s.thread.isRunning && s.composer.dictation != null}
      >
        <ComposerPrimitive.StopDictation
          className="flex size-8 items-center justify-center rounded-md bg-[#0d0d0d] text-white transition-colors hover:bg-[#2a2a2a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5]"
          aria-label="Stop dictation"
        >
          <div className="size-2.5 animate-pulse rounded-[2px] bg-current" />
        </ComposerPrimitive.StopDictation>
      </AuiIf>

      <AuiIf
        condition={(s) =>
          !s.thread.isRunning &&
          s.composer.dictation == null &&
          !s.composer.isEmpty
        }
      >
        <ComposerPrimitive.Send disabled={hasRejectedFile} className="flex size-8 items-center justify-center rounded-md bg-[#0d0d0d] text-white transition-colors hover:bg-[#2a2a2a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5] disabled:pointer-events-none disabled:opacity-50">
          <ArrowUpIcon width={16} height={16} />
        </ComposerPrimitive.Send>
      </AuiIf>

      <AuiIf
        condition={(s) =>
          !s.thread.isRunning &&
          s.composer.dictation == null &&
          s.composer.isEmpty
        }
      >
        <ComposerPrimitive.Dictate
          className="flex size-8 items-center justify-center rounded-md text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/5 dark:hover:text-[#ececec]"
          aria-label="Use voice mode"
        >
          <AudioLines className="size-4" />
        </ComposerPrimitive.Dictate>
      </AuiIf>
    </>
  );
};

const ModelPicker: FC = () => {
  const { models, selected, select, effort, setEffort } = useModel();
  const options = useMemo<ModelOption[]>(
    () =>
      models.map((m) => {
        const context = formatContextWindow(m.context_window);
        return {
          id: m.id,
          name: formatModelName(m.id),
          icon: modelIcon(m.id),
          ...(context ? { description: `${context} context window` } : {}),
          ...(m.supports_reasoning ? { efforts: true as const } : {}),
        };
      }),
    [models],
  );
  if (!selected) return null;

  return (
    <ModelSelectorRoot
      models={options}
      value={selected}
      onValueChange={select}
      effort={effort}
      onEffortChange={setEffort}
    >
      <ModelSelectorTrigger variant="ghost" size="sm" aria-label="Choose model" />
      <ModelSelectorContent align="end" searchable={options.length > 6} />
    </ModelSelectorRoot>
  );
};

// "Search" switch: when on, the model must answer using a web search.
const SearchToggle: FC = () => {
  const { models, selected, webSearch, setWebSearch } = useModel();
  const supported = models.find((m) => m.id === selected)?.supports_web_search ?? false;
  if (!selected) return null;
  const on = webSearch && supported;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Search the web"
      disabled={!supported}
      title={supported ? "Search the web" : "This model can't search the web"}
      onClick={() => setWebSearch(!webSearch)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        on
          ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-transparent text-[#5d5d5d] hover:bg-[#0d0d0d]/5 dark:text-[#cdcdcd] dark:hover:bg-white/5",
      )}
    >
      <Globe className="size-4" />
      <span>Search</span>
    </button>
  );
};

const ModeTabs: FC = () => {
  const tabs = [
    { label: "Write", Icon: PenLine },
    { label: "Learn", Icon: GraduationCap },
    { label: "Code", Icon: CodeIcon },
    { label: "From Drive", Icon: FolderOpen },
    { label: "From Calendar", Icon: CalendarIcon },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {tabs.map(({ label, Icon }) => (
        <button
          key={label}
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-transparent px-3 text-sm whitespace-nowrap text-[#0d0d0d] transition-colors hover:bg-black/[0.05] dark:border-white/15 dark:text-[#ececec] dark:hover:bg-white/10"
        >
          <Icon className="size-3.5 text-[#5d5d5d] dark:text-[#cdcdcd]" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

// A failed reply: what went wrong, with the element's retry path (re-runs from the user's message).
const MessageError: FC = () => {
  const aui = useAui();
  const error = useMessageError();
  const retrying = useAuiState((s) => s.thread.isRunning);
  const detail = String(error).slice(0, 240);
  return (
    <ErrorState
      title="Couldn't get a reply"
      detail={detail}
      retrying={retrying}
      onRetry={() => aui.message.reload()}
      className="mt-2"
    />
  );
};

// Word-by-word reveal with a caret while a part is still streaming.
const StreamingPart: FC<{ text: string }> = ({ text }) => {
  const segments = useMemo<Segment[]>(() => [{ text }], [text]);
  const count = useMemo(() => text.split(" ").length, [text]);
  return <StreamingText segments={segments} count={count} streaming />;
};

// Shown from sending a message until the model produces its first words, which can take a
// while for reasoning models: a run is active and the newest message has no text yet.
const AssistantTyping: FC = () => {
  const waiting = useAuiState((s) => {
    if (!s.thread.isRunning) return false;
    const last = s.thread.messages.at(-1);
    if (!last) return false;
    if (last.role === "user") return true;
    return !last.parts.some(
      (p) =>
        ((p.type === "text" || p.type === "reasoning") && p.text.trim() !== "") ||
        (p.type === "data" && p.name === "web_search"),
    );
  });
  if (!waiting) return null;
  return (
    <div className="mx-auto w-full max-w-3xl py-3">
      <TypingIndicator variant="bare" />
    </div>
  );
};

type WebSearchData = {
  status: "searching" | "done";
  queries: string[];
  sources: { title: string; url: string; domain: string }[];
};

// The graph reports the web search it ran as a custom UI message attached to the reply.
const WebSearchCard: FC = () => {
  const data = useAuiState((s) => {
    const part = s.message.parts.find((p) => p.type === "data" && p.name === "web_search");
    return part?.type === "data" ? (part.data as WebSearchData) : undefined;
  });
  if (!data || data.queries.length === 0) return null;
  const [first, ...rest] = data.queries;
  return (
    <div className="mb-3">
      <WebSearch
        query={rest.length ? `${first} +${rest.length} more` : first!}
        results={data.sources}
        visibleResults={data.sources.length}
        searching={data.status === "searching"}
        cycle={0}
      />
    </div>
  );
};

// Consecutive reasoning parts collapse into one "thinking" disclosure.
const messageGroupBy = groupPartByType({ reasoning: ["group-reasoning"] });

const reasoningSeconds = (timing: { startedAt: number; completedAt?: number } | undefined) =>
  timing?.completedAt === undefined
    ? undefined
    : Math.round((timing.completedAt - timing.startedAt) / 1000);

const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/message relative mx-auto flex w-full max-w-3xl flex-col py-2">
      <AuiIf condition={(s) => s.message.role === "user"}>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-2 empty:hidden">
            <MessagePrimitive.Attachments components={{ Attachment: ClaudeAttachment }} />
            <MessagePrimitive.Parts>
              {({ part }) => {
                // Files of a reloaded thread arrive as message parts rather than attachments.
                if (part.type === "image") return <SentFileChip name="Image" image />;
                if (part.type === "file") return <SentFileChip name={part.filename ?? "File"} />;
                return null;
              }}
            </MessagePrimitive.Parts>
          </div>
          <div className="max-w-[80%] rounded-2xl bg-[#0d0d0d] px-4 py-2.5 wrap-break-word whitespace-pre-wrap text-white empty:hidden dark:bg-[#ececec] dark:text-[#0d0d0d]">
            <MessagePrimitive.Parts>
              {({ part }) => {
                if (part.type === "text" && part.text.trim() !== "") return <MarkdownText />;
                return null;
              }}
            </MessagePrimitive.Parts>
          </div>
          <ActionBarPrimitive.Root className="-mt-px flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100">
            <ActionBarPrimitive.Edit className={messageActionButtonClassName}>
              <PencilIcon width={16} height={16} />
            </ActionBarPrimitive.Edit>
            <ActionBarPrimitive.Copy className={messageActionButtonClassName}>
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <ClipboardIcon width={16} height={16} />
              </AuiIf>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.message.role === "assistant"}>
        <div className="flex flex-col">
          <div className="prose prose-claude leading-[1.65rem] wrap-break-word text-[#0d0d0d] dark:text-[#ececec]">
            <WebSearchCard />
            <MessagePrimitive.GroupedParts groupBy={messageGroupBy}>
              {({ part, children }) => {
                switch (part.type) {
                  case "group-reasoning": {
                    const running = part.status.type === "running";
                    return (
                      <ReasoningRoot variant="ghost" streaming={running}>
                        <ReasoningTrigger
                          active={running}
                          duration={reasoningSeconds(part.timing)}
                        />
                        <ReasoningContent aria-busy={running}>
                          <ReasoningText>{children}</ReasoningText>
                        </ReasoningContent>
                      </ReasoningRoot>
                    );
                  }
                  case "reasoning":
                    return part.status.type === "running" ? (
                      <StreamingPart text={part.text} />
                    ) : (
                      <Reasoning {...part} />
                    );
                  case "text":
                    return part.status.type === "running" ? (
                      <StreamingPart text={part.text} />
                    ) : (
                      <MarkdownText />
                    );
                  default:
                    return null;
                }
              }}
            </MessagePrimitive.GroupedParts>
            <MessagePrimitive.Error>
              <MessageError />
            </MessagePrimitive.Error>
          </div>
          <ActionBarPrimitive.Root className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100">
            <ActionBarPrimitive.Copy className={messageActionButtonClassName}>
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <ClipboardIcon width={16} height={16} />
              </AuiIf>
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.FeedbackPositive
              className={messageActionButtonClassName}
            >
              <ThumbsUp className="size-4" />
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative
              className={messageActionButtonClassName}
            >
              <ThumbsDown className="size-4" />
            </ActionBarPrimitive.FeedbackNegative>
            <ActionBarPrimitive.Reload className={messageActionButtonClassName}>
              <RefreshCwIcon width={16} height={16} />
            </ActionBarPrimitive.Reload>
          </ActionBarPrimitive.Root>
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
};

const typeLabel = (name: string, contentType?: string) =>
  (name.split(".").pop() || contentType?.split("/").pop() || "file").toUpperCase();

// Sent files get the same chip, minus the remove button and the "done" check mark.
const SENT_CHIP = "[&>span:last-of-type]:hidden";

const SentFileChip: FC<{ name: string; image?: boolean }> = ({ name, image }) => (
  <ComposerAttachmentChip
    attachment={{ name, meta: typeLabel(name), state: "done", kind: image ? "image" : "text" }}
    className={SENT_CHIP}
  />
);

// A staged or sent file, drawn with the assistant-ui composer attachment chip.
const ClaudeAttachment: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const name = useAuiState((s) => s.attachment.name);
  const kind = useAuiState((s) => (s.attachment.type === "image" ? "image" : "text"));
  const state = useAuiState((s) => {
    const t = s.attachment.status.type;
    return t === "running" ? "uploading" : t === "incomplete" ? "error" : "done";
  });
  const progress = useAuiState((s) =>
    s.attachment.status.type === "running" ? s.attachment.status.progress : 0,
  );
  const meta = useAuiState((s) => {
    const { status, file, contentType, name } = s.attachment;
    if (status.type === "incomplete") return status.message ?? "Couldn't attach this file";
    return file ? formatBytes(file.size) : typeLabel(name, contentType);
  });

  return (
    <AttachmentPrimitive.Root className="relative">
      <ComposerAttachmentChip
        attachment={{ name, meta, state, progress, kind }}
        onRemove={isComposer ? () => aui.attachment.remove() : undefined}
        className={cn(!isComposer && SENT_CHIP, "max-w-72")}
      />
      {/* The chip has no remove button in its error state, but a rejected file must be removable. */}
      {isComposer && state === "error" && (
        <AttachmentPrimitive.Remove
          aria-label={`Remove ${name}`}
          className="absolute end-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-[#5d5d5d] hover:bg-[#0d0d0d]/10 dark:text-[#cdcdcd] dark:hover:bg-white/10"
        >
          <XIcon width={12} height={12} />
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
};
