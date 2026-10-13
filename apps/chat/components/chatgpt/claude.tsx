"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowUpIcon,
  AudioLines,
  Calendar as CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
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
import { useMemo, useState, type FC } from "react";
import { useAttachmentSrc } from "@/hooks/use-attachment-src";
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
  return (
    <ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-[28px] border border-[#e5e5e5] bg-white px-3.5 pt-3 pb-2.5 focus-within:border-[#d0d0d0] dark:border-transparent dark:bg-[#212121] dark:focus-within:border-transparent">
      <ComposerPrimitive.Input
        placeholder="How can I help you today?"
        rows={1}
        className="block max-h-72 min-h-6 w-full resize-none bg-transparent text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e] dark:text-[#ececec] dark:placeholder:text-[#8e8e8e]"
      />

      <div className="flex w-full items-center gap-2">
        <ComposerPrimitive.AddAttachment
          aria-label="Add attachment"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/5 dark:hover:text-[#ececec]"
        >
          <PlusIcon width={16} height={16} />
        </ComposerPrimitive.AddAttachment>

        <div className="ml-auto flex items-center gap-1">
          <ModelPicker />
          <ComposerPrimaryAction />
        </div>
      </div>

      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="-mx-1 -mb-1 flex flex-row gap-2 overflow-x-auto pt-1">
          <ComposerPrimitive.Attachments>
            {() => <ClaudeAttachment />}
          </ComposerPrimitive.Attachments>
        </div>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
};

const ComposerPrimaryAction: FC = () => {
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
        <ComposerPrimitive.Send className="flex size-8 items-center justify-center rounded-md bg-[#0d0d0d] text-white transition-colors hover:bg-[#2a2a2a] dark:bg-white dark:text-black dark:hover:bg-[#e5e5e5] disabled:pointer-events-none disabled:opacity-50">
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

const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/message relative mx-auto flex w-full max-w-3xl flex-col py-2">
      <AuiIf condition={(s) => s.message.role === "user"}>
        <div className="flex flex-col items-end gap-1">
          <div className="max-w-[80%] rounded-2xl bg-[#0d0d0d] px-4 py-2.5 wrap-break-word whitespace-pre-wrap text-white dark:bg-[#ececec] dark:text-[#0d0d0d]">
            <MessagePrimitive.Parts>
              {({ part }) => {
                if (part.type === "text") return <MarkdownText />;
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
            <MessagePrimitive.Parts>
              {({ part }) => {
                if (part.type === "text") return <MarkdownText />;
                return null;
              }}
            </MessagePrimitive.Parts>
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

const ClaudeAttachment: FC = () => {
  const isImage = useAuiState((s) => s.attachment.type === "image");
  const src = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Root className="group/thumbnail relative">
      <div
        className="overflow-hidden rounded-lg border border-[#e5e5e5] dark:border-white/15"
        style={{ width: "80px", height: "80px" }}
      >
        {isImage && src ? (
          <img
            className="h-full w-full object-cover"
            alt="Attachment"
            src={src}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white text-[#5d5d5d] dark:bg-black dark:text-[#cdcdcd]">
            <AttachmentPrimitive.unstable_Thumb className="text-xs" />
          </div>
        )}
      </div>
      <AttachmentPrimitive.Remove
        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-[#0d0d0d] text-white opacity-0 transition-opacity group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100 hover:bg-[#2a2a2a] dark:bg-white dark:text-[#0d0d0d] dark:hover:bg-[#cdcdcd]"
        aria-label="Remove attachment"
      >
        <XIcon width={12} height={12} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};
