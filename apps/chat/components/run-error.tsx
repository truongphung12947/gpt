"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { ErrorState } from "@/components/assistant-ui/elements/error-state";

type RunErrorState = {
  error: string | null;
  /** Called by the runtime's error handler. */
  report: (error: unknown) => void;
  /** Called with the thread's running flag; a run that ends without a new error clears the banner. */
  noteRunState: (running: boolean) => void;
  clear: () => void;
};

const RunErrorContext = createContext<RunErrorState | null>(null);

const describe = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Something went wrong";
};

/** Remembers the last failed run so the thread can show it, even when no reply text exists. */
export const RunErrorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);
  const failedThisRun = useRef(false);

  const report = useCallback((e: unknown) => {
    failedThisRun.current = true;
    setError(describe(e));
  }, []);
  const noteRunState = useCallback((running: boolean) => {
    if (running) failedThisRun.current = false;
    else if (!failedThisRun.current) setError(null);
  }, []);
  const clear = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ error, report, noteRunState, clear }),
    [error, report, noteRunState, clear],
  );
  return <RunErrorContext.Provider value={value}>{children}</RunErrorContext.Provider>;
};

export const useRunError = () => {
  const ctx = useContext(RunErrorContext);
  if (!ctx) throw new Error("useRunError must be used inside RunErrorProvider");
  return ctx;
};

/**
 * Error state for a run that failed before any reply existed (the runtime only attaches an
 * error to a reply that has started). Retry re-runs from the last user message.
 */
export const RunErrorBanner: FC = () => {
  const aui = useAui();
  const { error, noteRunState, clear } = useRunError();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const threadId = useAuiState((s) => s.threadListItem.externalId);
  // The reply itself already shows its own error banner when it is the one that failed.
  const replyFailed = useAuiState((s) => {
    const last = s.thread.messages.at(-1);
    return last?.role === "assistant" && last.status?.type === "incomplete" && last.status.reason === "error";
  });
  const lastUserId = useAuiState(
    (s) => [...s.thread.messages].reverse().find((m) => m.role === "user")?.id ?? "",
  );
  const sentFiles = useAuiState((s) => {
    const user = [...s.thread.messages].reverse().find((m) => m.role === "user");
    return !!user && (user.attachments.length > 0 || user.content.some((p) => p.type === "image" || p.type === "file"));
  });

  useEffect(() => noteRunState(isRunning), [isRunning, noteRunState]);
  useEffect(() => clear(), [threadId, clear]);

  if (!error || replyFailed) return null;
  const detail = sentFiles
    ? `${error}. This model may not accept images or files; try another model.`
    : error;

  return (
    <div className="mx-auto w-full max-w-3xl py-2">
      <ErrorState
        title="Couldn't get a reply"
        detail={detail.slice(0, 240)}
        retrying={isRunning}
        onRetry={() => aui.thread().startRun({ parentId: lastUserId })}
        className="max-w-md"
      />
    </div>
  );
};
