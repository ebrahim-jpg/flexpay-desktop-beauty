"use client";

import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (code: string) => void;
  minLength?: number;
  // أقصى فرق زمني بين ضغطتين عشان نعتبرهم من السكانر (مش كتابة يدوية)
  maxIntervalMs?: number;
}

// السكانر = كيبورد بيكتب الأرقام بسرعة + Enter في الآخر.
// نميّزه عن الكتابة اليدوية عن طريق سرعة الإدخال (الدستور §8 — الباركود).
export function useBarcodeScanner({
  enabled = true,
  onScan,
  minLength = 3,
  maxIntervalMs = 50,
}: UseBarcodeScannerOptions) {
  const buffer = useRef("");
  const lastTime = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastTime.current;

      if (e.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= minLength) {
          // امنع سلوك Enter الافتراضي + امنع وصوله لاختصار «Enter = حساب»
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        return;
      }

      // أحرف الباركود (رقم أو حرف مفرد)
      if (e.key.length === 1) {
        if (gap > maxIntervalMs) {
          buffer.current = "";
        }
        buffer.current += e.key;
        lastTime.current = now;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxIntervalMs]);
}
