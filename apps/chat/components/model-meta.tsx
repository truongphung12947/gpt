import { Sparkle } from "lucide-react";
import type { ReactNode } from "react";
import {
  ClaudeLogo,
  GeminiLogo,
  OpenAILogo,
} from "@/components/assistant-ui/elements/logos";

/** "gpt-6.1-sol" -> "GPT-6.1 Sol", "deepseek-v4-flash" -> "Deepseek V4 Flash" */
export function formatModelName(id: string): string {
  const gpt = /^gpt-(\d[\d.]*)(?:-(.*))?$/i.exec(id);
  const title = (s: string) =>
    s
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => (/^\d/.test(w) ? w : w[0]!.toUpperCase() + w.slice(1)))
      .join(" ");
  if (gpt) return `GPT-${gpt[1]}${gpt[2] ? ` ${title(gpt[2])}` : ""}`;
  return title(id);
}

/** 922000 -> "922K", 1_100_000 -> "1.1M" */
export function formatContextWindow(tokens: number | null | undefined): string | undefined {
  if (!tokens) return undefined;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(tokens / 1000)}K`;
}

/** Provider mark chosen from the model id (LiteLLM's own provider field is the hosting cloud). */
export function modelIcon(id: string): ReactNode {
  if (/^(gpt|o\d|chatgpt|openai)/i.test(id)) return <OpenAILogo className="size-4" />;
  if (/claude/i.test(id)) return <ClaudeLogo className="size-4" />;
  if (/gemini/i.test(id)) return <GeminiLogo className="size-4" />;
  return <Sparkle className="size-4" />;
}
