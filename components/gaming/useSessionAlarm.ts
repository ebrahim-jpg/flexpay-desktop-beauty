"use client";

import { useEffect } from "react";

// صوت تنبيه «وقت الغرفة خلص» — نغمتين بالتبادل كل ثانية **من غير توقف** لحد ما يتحقق شرط
// الإيقاف (تمديد · حساب · إلغاء · إسكات). مولَّد بـWebAudio فمفيش ملف صوت يتشحن مع البرنامج.
export function useSessionAlarm(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }
    let high = true;
    const beep = () => {
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = high ? 880 : 660;
        high = !high;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.45);
      } catch {
        /* جهاز بلا صوت — التنبيه الأحمر على الكارت كفاية */
      }
    };
    beep();
    const timer = setInterval(beep, 1000);
    return () => {
      clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [active]);
}
