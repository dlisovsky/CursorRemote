/** Structured log for outbound Telegram posts (audit dialog without webhooks). */

export type TelegramOutAction = 'send' | 'edit' | 'delete';

export function logTelegramOut(
  action: TelegramOutAction,
  threadId: number,
  kind: string,
  extra?: {
    parts?: number;
    msgId?: number;
    chars?: number;
    elementId?: string;
  }
): void {
  const bits = [
    `[telegram-out] ${action}`,
    `thread=${threadId}`,
    `kind=${kind}`,
  ];
  if (extra?.parts !== undefined) bits.push(`parts=${extra.parts}`);
  if (extra?.msgId !== undefined) bits.push(`msgId=${extra.msgId}`);
  if (extra?.chars !== undefined) bits.push(`chars=${extra.chars}`);
  if (extra?.elementId) bits.push(`el=${extra.elementId.slice(0, 12)}`);
  console.log(bits.join(' '));
}
