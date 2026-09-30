"use client";

import { useCallback, useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface PINPadProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// لوحة إدخال الـ PIN — تدعم الماوس والكيبورد
export function PINPad({
  value,
  onChange,
  length = 4,
  disabled = false,
  error = false,
}: PINPadProps) {
  const press = useCallback(
    (digit: string) => {
      if (disabled) return;
      if (value.length >= length) return;
      onChange(value + digit);
    },
    [value, length, disabled, onChange]
  );

  const backspace = useCallback(() => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }, [value, disabled, onChange]);

  // دعم الكيبورد
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") backspace();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, backspace]);

  return (
    <div className="space-y-6">
      {/* نقاط الـ PIN */}
      <div className="flex justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-colors",
              error
                ? "border-danger"
                : i < value.length
                  ? "border-primary bg-primary"
                  : "border-border"
            )}
          />
        ))}
      </div>

      {/* الأزرار */}
      <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={disabled}
            className="flex h-16 items-center justify-center rounded-lg border border-border bg-surface text-xl font-semibold text-text-primary transition-colors hover:bg-surface-secondary active:scale-[0.98] disabled:opacity-50"
          >
            {k}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press("0")}
          disabled={disabled}
          className="flex h-16 items-center justify-center rounded-lg border border-border bg-surface text-xl font-semibold text-text-primary transition-colors hover:bg-surface-secondary active:scale-[0.98] disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={disabled}
          className="flex h-16 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-secondary active:scale-[0.98] disabled:opacity-50"
          aria-label="مسح"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
