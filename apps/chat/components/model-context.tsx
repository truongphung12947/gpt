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
  supports_web_search: boolean;
};

type ModelState = {
  models: ChatModel[];
  selected: string | undefined;
  select: (model: string) => void;
  effort: string;
  setEffort: (effort: string) => void;
  /** The composer's "Search" switch (only takes effect for models that can search). */
  webSearch: boolean;
  setWebSearch: (on: boolean) => void;
  /** Latest model, thinking level and search switch, for code that runs outside React renders. */
  getRunConfig: () => { model?: string; reasoning_effort?: string; web_search?: boolean };
};

const ModelContext = createContext<ModelState | null>(null);
const STORAGE_KEY = "chat:model";
const EFFORT_KEY = "chat:effort";
const SEARCH_KEY = "chat:websearch";

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [effort, setEffortState] = useState("medium");
  const selectedRef = useRef<string | undefined>(undefined);
  const effortRef = useRef("medium");
  const [webSearch, setWebSearchState] = useState(false);
  const webSearchRef = useRef(false);
  const modelsRef = useRef<ChatModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models: ChatModel[]; default: string } | null) => {
        if (cancelled || !d) return;
        let saved: string | null = null;
        let savedEffort: string | null = null;
        let savedSearch: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
          savedEffort = localStorage.getItem(EFFORT_KEY);
          savedSearch = localStorage.getItem(SEARCH_KEY);
        } catch {}
        if (savedSearch === "1") {
          webSearchRef.current = true;
          setWebSearchState(true);
        }
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

  const setWebSearch = useCallback((on: boolean) => {
    webSearchRef.current = on;
    setWebSearchState(on);
    try {
      localStorage.setItem(SEARCH_KEY, on ? "1" : "0");
    } catch {}
  }, []);

  const getRunConfig = useCallback(() => {
    const model = selectedRef.current;
    const info = modelsRef.current.find((m) => m.id === model);
    return {
      ...(model ? { model } : {}),
      ...(info?.supports_reasoning ? { reasoning_effort: effortRef.current } : {}),
      ...(info?.supports_web_search && webSearchRef.current ? { web_search: true } : {}),
    };
  }, []);

  const value = useMemo(
    () => ({ models, selected, select, effort, setEffort, webSearch, setWebSearch, getRunConfig }),
    [models, selected, select, effort, setEffort, webSearch, setWebSearch, getRunConfig],
  );
  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export const useModel = () => {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel must be used inside ModelProvider");
  return ctx;
};
