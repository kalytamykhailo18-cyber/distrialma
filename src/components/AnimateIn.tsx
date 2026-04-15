"use client";

import { useEffect, useState, useRef, useCallback, createContext, useContext } from "react";

/* ── Page-level readiness context ── */
const ReadyContext = createContext(false);

export function PageTransition({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setReady(true)); }, []);
  return (
    <ReadyContext.Provider value={ready}>
      <div className={className}>{children}</div>
    </ReadyContext.Provider>
  );
}

/* ── Staggered entrance wrapper ── */
export function Stagger({ delay = 0, y = 10, children, className = "", show }: {
  delay?: number; y?: number; children: React.ReactNode; className?: string; show?: boolean;
}) {
  const pageReady = useContext(ReadyContext);
  const visible = show !== undefined ? show : pageReady;
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : `translateY(${y}px) scale(0.98)`,
        transition: `opacity 400ms cubic-bezier(0.25,1,0.5,1) ${delay}ms, transform 400ms cubic-bezier(0.25,1,0.5,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Individual row/item entrance (inline style) ── */
export function staggerStyle(show: boolean, index: number, baseDelay = 100, perItem = 25) {
  return {
    opacity: show ? 1 : 0,
    transform: show ? "translateY(0)" : "translateY(8px)",
    transition: `opacity 350ms cubic-bezier(0.25,1,0.5,1) ${baseDelay + index * perItem}ms, transform 350ms cubic-bezier(0.25,1,0.5,1) ${baseDelay + index * perItem}ms, background-color 200ms ease`,
  };
}

/* ── Collapsible panel with smooth height ── */
export function CollapsiblePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const first = useRef(true);

  const measure = useCallback(() => {
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, []);

  useEffect(() => { measure(); if (first.current) first.current = false; }, [open, children, measure]);

  return (
    <div
      style={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
        transition: first.current ? "none" : "height 300ms cubic-bezier(0.25,1,0.5,1), opacity 220ms ease",
      }}
      className="overflow-hidden"
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

/* ── Trigger entrance when data loads (not page mount) ── */
export function useDataReady(dep: unknown) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (dep) {
      setReady(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    } else {
      setReady(false);
    }
  }, [dep]);
  return ready;
}

/* ── Shared button spring class ── */
export const springBtn = "transition-all duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-[0.96]";

/* ── Shared hover row class ── */
export const hoverRow = "transition-colors duration-150 hover:bg-gray-50/60";

/* ── Loading spinner ── */
export function Spinner({ className = "w-5 h-5", color = "border-brand-500" }: { className?: string; color?: string }) {
  return <div className={`${className} border-2 ${color} border-t-transparent rounded-full animate-spin`} />;
}

export function LoadingCenter({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 py-12 justify-center">
      <Spinner />
      <span className="text-gray-400 text-sm">{text}</span>
    </div>
  );
}
