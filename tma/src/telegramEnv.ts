/** Telegram WebApp detection — independent of mock-auth dev mode. */

export function getTelegramInitData(): string {
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  return tg?.initData?.trim() ?? "";
}

/** True when opened inside Telegram with real initData (BackButton, safe areas, etc.). */
export function isTelegramWebApp(): boolean {
  return getTelegramInitData().length > 0;
}

/** TG-style layout: real Mini App or Chrome preview via VITE_FORCE_TG_UI. */
export function isTelegramLayout(): boolean {
  return isTelegramWebApp() || import.meta.env.VITE_FORCE_TG_UI === "true";
}

export function mockAuthEnabled(): boolean {
  return import.meta.env.VITE_MOCK_TG === "true";
}
