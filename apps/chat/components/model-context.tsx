"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ChatModel = {
  id: string;
  context_window: number | null;
  supports_reasoning: boolean;
};

type ModelState = {
  models: ChatModel[];
  selected: string | undefined;
  select: (model: string) => void;
  effort: string;
  setEffort: (effort: string) => void;
  /** Latest model + thinking level, for code that runs outside React renders. */
  getRunConfig: () => { model?: string; reasoning_effort?: string };
};

const ModelContext = createContext<ModelState | null>(null);
const STORAGE_KEY = "chat:model";
const EFFORT_KEY = "chat:effort";

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [effort, setEffortState] = useState("medium");
  const selectedRef = useRef<string | undefined>(undefined);
  const effortRef = useRef("medium");
  const modelsRef = useRef<ChatModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models: ChatModel[]; default: string } | null) => {
        if (cancelled || !d) return;
        let saved: string | null = null;
        let savedEffort: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
          savedEffort = localStorage.getItem(EFFORT_KEY);
        } catch {}
        const initial =
          saved && d.models.some((m) => m.id === saved) ? saved : d.default;
        selectedRef.current = initial;
        modelsRef.current = d.models;
        if (savedEffort) {
          effortRef.current = savedEffort;
          setEffortState(savedEffort);
        }
        setModels(d.models);
        setSelected(initial);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback((model: string) => {
    selectedRef.current = model;
    setSelected(model);
    try {
      localStorage.setItem(STORAGE_KEY, model);
    } catch {}
  }, []);

  const setEffort = useCallback((next: string) => {
    effortRef.current = next;
    setEffortState(next);
    try {
      localStorage.setItem(EFFORT_KEY, next);
    } catch {}
  }, []);

  const getRunConfig = useCallback(() => {
    const model = selectedRef.current;
    const reasoning = modelsRef.current.find((m) => m.id === model)?.supports_reasoning;
    return {
      ...(model ? { model } : {}),
      ...(reasoning ? { reasoning_effort: effortRef.current } : {}),
    };
  }, []);

  const value = useMemo(
    () => ({ models, selected, select, effort, setEffort, getRunConfig }),
    [models, selected, select, effort, setEffort, getRunConfig],
  );
  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export const useModel = () => {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel must be used inside ModelProvider");
  return ctx;
};
