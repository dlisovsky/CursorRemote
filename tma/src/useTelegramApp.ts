import { useEffect, useRef } from "react";
import { isTelegramWebApp } from "./telegramEnv.js";

export { isTelegramWebApp, isTelegramLayout } from "./telegramEnv.js";

function getTgHaptic(): { impactOccurred?: (style: string) => void } | undefined {
  return (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (style: string) => void } } } })
    .Telegram?.WebApp?.HapticFeedback;
}

/** Light haptic on send/stop in real Telegram (no-op elsewhere). */
export function telegramHaptic(style: "light" | "medium" | "heavy" = "light"): void {
  if (!isTelegramWebApp()) return;
  try {
    getTgHaptic()?.impactOccurred?.(style);
  } catch {
    /* older WebApp stubs */
  }
}

interface TelegramWebApp {
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton?: {
    text: string;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (text: string) => void;
    color?: string;
    textColor?: string;
    isVisible?: boolean;
  };
}

function getTg(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

const TG_BG = "#1a1b1e";

export function useTelegramApp(): void {
  useEffect(() => {
    if (!isTelegramWebApp()) return;
    const tg = getTg();
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
    try {
      tg.setHeaderColor?.(TG_BG);
      tg.setBackgroundColor?.(TG_BG);
    } catch {
      // Older WebApp stubs in Chrome may not support theme APIs
    }

    const applyInsets = () => {
      const inset = tg.contentSafeAreaInset ?? tg.safeAreaInset;
      if (!inset) return;
      const root = document.documentElement;
      root.style.setProperty("--tg-safe-top", `${inset.top}px`);
      root.style.setProperty("--tg-safe-bottom", `${inset.bottom}px`);
    };

    applyInsets();

    const onViewportChanged = () => applyInsets();
    const webApp = tg as TelegramWebApp & {
      onEvent?: (event: string, cb: () => void) => void;
      offEvent?: (event: string, cb: () => void) => void;
    };
    webApp.onEvent?.("viewportChanged", onViewportChanged);

    return () => {
      webApp.offEvent?.("viewportChanged", onViewportChanged);
    };
  }, []);
}

export function useTelegramBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    if (!isTelegramWebApp()) return;
    const btn = getTg()?.BackButton;
    if (!btn || !onBack) {
      btn?.hide?.();
      return;
    }

    btn.show();
    btn.onClick(onBack);
    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
  }, [onBack]);
}
