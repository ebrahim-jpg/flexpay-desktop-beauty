"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: number;
  label: string;
  disabled?: boolean;
}

// قائمة منسدلة بخاصية بحث — للقوائم الطويلة (زي 150+ مادة)
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  className,
}: {
  value: number;
  options: SearchableOption[];
  onChange: (value: number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  function pick(v: number) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary transition-colors hover:border-text-secondary/40"
      >
        <span className={cn("truncate", !selected && "text-text-secondary")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-secondary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-secondary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-secondary">
                مفيش نتائج
              </div>
            ) : (
              filtered.map((o) => {
                const isSel = o.value === value;
                const isDisabled = !!o.disabled && !isSel;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => pick(o.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm transition-colors",
                      isDisabled
                        ? "cursor-not-allowed text-text-secondary/50"
                        : "text-text-primary hover:bg-surface-secondary",
                      isSel && "bg-primary/10 font-medium text-primary"
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : isDisabled ? (
                      <span className="shrink-0 text-xs">مستخدمة</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
