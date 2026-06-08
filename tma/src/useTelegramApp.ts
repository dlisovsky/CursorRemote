import { useEffect } from "react";

interface TelegramWebApp {
  ready?: () => void;
  expand?: () => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

function getTg(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function useTelegramApp(): void {
  useEffect(() => {
    const tg = getTg();
    tg?.ready?.();
    tg?.expand?.();
  }, []);
}

export function useTelegramBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    const tg = getTg();
    const btn = tg?.BackButton;
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
