"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { ActivationGate } from "@/components/activation/ActivationGate";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <ActivationGate>{children}</ActivationGate>
      <Toaster
        position="top-center"
        dir="rtl"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: "var(--font-cairo)" } }}
      />
    </ThemeProvider>
  );
}
