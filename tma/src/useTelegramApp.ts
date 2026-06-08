import { useEffect } from "react";

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

/** True when opened inside Telegram (not Chrome mock dev). */
export function isTelegramWebApp(): boolean {
  if (import.meta.env.VITE_MOCK_TG === "true") return false;
  const initData = (getTg() as { initData?: string } | undefined)?.initData?.trim() ?? "";
  return initData.length > 0;
}

const TG_BG = "#1a1b1e";

export function useTelegramApp(): void {
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
    tg.setHeaderColor?.(TG_BG);
    tg.setBackgroundColor?.(TG_BG);

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
  useEffect(() => {
    if (!isTelegramWebApp()) return;
    const btn = getTg()?.MainButton;
    if (!btn || !options?.visible) {
      btn?.hide?.();
      return;
    }

    btn.setText(options.text);
    if (options.enabled === false) btn.disable();
    else btn.enable();
    btn.show();
    btn.onClick(options.onClick);
    return () => {
      btn.offClick(options.onClick);
      btn.hide();
    };
  }, [options?.text, options?.visible, options?.enabled, options?.onClick]);
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
