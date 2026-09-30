// تعريف الجسر المكشوف من preload على window
export {};

declare global {
  interface Window {
    electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (
        channel: string,
        callback: (payload: unknown) => void
      ) => () => void;
    };
  }
}
