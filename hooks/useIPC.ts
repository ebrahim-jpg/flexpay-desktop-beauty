"use client";

import { useCallback } from "react";
import type { IpcChannels, IpcResult } from "@/types/ipc.types";

// خطأ موحد لو الجسر مش متاح (يعني التطبيق مفتوح برّه Electron)
class IpcUnavailableError extends Error {
  constructor() {
    super("التطبيق لازم يشتغل داخل Electron");
    this.name = "IpcUnavailableError";
  }
}

type ChannelInput<C extends keyof IpcChannels> = IpcChannels[C]["input"];
type ChannelOutput<C extends keyof IpcChannels> = IpcChannels[C]["output"];

// نداء IPC مُنمَّط بالكامل + يفك غلاف IpcResult ويرمي الخطأ كنص عربي
async function invokeChannel<C extends keyof IpcChannels>(
  channel: C,
  ...args: ChannelInput<C> extends void ? [] : [ChannelInput<C>]
): Promise<ChannelOutput<C>> {
  if (typeof window === "undefined" || !window.electron) {
    throw new IpcUnavailableError();
  }
  const result = (await window.electron.invoke(
    channel,
    ...(args as unknown[])
  )) as IpcResult<ChannelOutput<C>>;

  if (!result || result.ok !== true) {
    throw new Error(result?.error ?? "حصل خطأ غير متوقع");
  }
  return result.data;
}

export function useIPC() {
  const invoke = useCallback(invokeChannel, []);
  return { invoke };
}

// نسخة قابلة للاستخدام خارج React (في stores مثلاً)
export const ipc = { invoke: invokeChannel };
export const isElectron = () =>
  typeof window !== "undefined" && !!window.electron;
