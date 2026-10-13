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

type ModelState = {
  models: string[];
  selected: string | undefined;
  select: (model: string) => void;
  /** Always the latest selection, for code that runs outside React renders. */
  getSelected: () => string | undefined;
};

const ModelContext = createContext<ModelState | null>(null);
const STORAGE_KEY = "chat:model";

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const selectedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models: string[]; default: string } | null) => {
        if (cancelled || !d) return;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
        } catch {}
        const initial = saved && d.models.includes(saved) ? saved : d.default;
        selectedRef.current = initial;
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

  const getSelected = useCallback(() => selectedRef.current, []);

  const value = useMemo(
    () => ({ models, selected, select, getSelected }),
    [models, selected, select, getSelected],
  );
  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export const useModel = () => {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel must be used inside ModelProvider");
  return ctx;
};
