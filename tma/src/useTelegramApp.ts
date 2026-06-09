import { useEffect, useRef } from "react";
import { isTelegramWebApp } from "./telegramEnv.js";

export { isTelegramWebApp } from "./telegramEnv.js";

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

    const inset = tg.contentSafeAreaInset ?? tg.safeAreaInset;
    if (inset) {
      const root = document.documentElement;
      root.style.setProperty("--tg-safe-top", `${inset.top}px`);
      root.style.setProperty("--tg-safe-bottom", `${inset.bottom}px`);
    }
  }, []);
}

/** Bottom padding when Telegram MainButton is visible (px). */
export function useTelegramMainButtonInset(visible: boolean): void {
  useEffect(() => {
    if (!isTelegramWebApp()) return;
    document.documentElement.style.setProperty("--tg-main-button", visible ? "54px" : "0px");
    return () => {
      document.documentElement.style.removeProperty("--tg-main-button");
    };
  }, [visible]);
}

export function useTelegramMainButton(
  options: { text: string; visible: boolean; enabled?: boolean; onClick: () => void } | null,
): void {
  const onClickRef = useRef(options?.onClick);
  onClickRef.current = options?.onClick;

  useEffect(() => {
    if (!isTelegramWebApp()) return;
    const btn = getTg()?.MainButton;
    if (!btn) return;

    const handler = () => onClickRef.current?.();

    if (!options?.visible) {
      btn.hide();
      return;
    }

    btn.onClick(handler);
    btn.show();
    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [options?.visible]);

  useEffect(() => {
    if (!isTelegramWebApp() || !options?.visible) return;
    const btn = getTg()?.MainButton;
    if (!btn) return;

    btn.setText(options.text);
    if (options.enabled === false) btn.disable();
    else btn.enable();
  }, [options?.text, options?.enabled, options?.visible]);
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
