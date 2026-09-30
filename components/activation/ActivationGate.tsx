"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ipc, isElectron } from "@/hooks/useIPC";
import { FullScreenLoading } from "@/components/shared/FullScreenLoading";
import { ActivationScreen } from "./ActivationScreen";

type GateState = "loading" | "need" | "ok";

// بوابة تفعيل قبل أي شيء — لو الجهاز مش مفعّل يطلب كود التفعيل.
// في الديف (برّه Electron) بنعدّي مباشرة عشان التطوير.
export function ActivationGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!isElectron()) {
        if (alive) setState("ok");
        return;
      }
      try {
        const res = await ipc.invoke("activation:status");
        if (!alive) return;
        setServerUrl(res.serverUrl ?? "");
        setState(res.activated ? "ok" : "need");
      } catch {
        if (alive) setState("need");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") return <FullScreenLoading />;
  if (state === "need") {
    return (
      <ActivationScreen
        defaultServerUrl={serverUrl}
        onActivated={() => setState("ok")}
      />
    );
  }
  return <>{children}</>;
}
