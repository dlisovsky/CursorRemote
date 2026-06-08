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

export function useTelegramApp(): void {
  useEffect(() => {
    const tg = getTg();
    tg?.ready?.();
    tg?.expand?.();
  }, []);
}

export function useTelegramMainButton(
  options: { text: string; visible: boolean; enabled?: boolean; onClick: () => void } | null,
): void {
  useEffect(() => {
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
