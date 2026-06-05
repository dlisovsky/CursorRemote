const MAX_APPROVAL_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Short Telegram-friendly approval text (full detail stays in Cursor / web).
 */
export function compactApprovalDescription(description: string): string {
  const d = description.trim();
  if (!d) return 'Action required';

  const dashIdx = d.lastIndexOf(' -- ');
  if (dashIdx !== -1) {
    const tail = d.slice(dashIdx + 4).trim();
    if (tail.length > 0 && tail.length < d.length * 0.85) {
      return truncate(tail, MAX_APPROVAL_CHARS);
    }
  }

  if (/\/bin\/zsh\b|COMMAND_EXIT_CODE|dump_zsh_state|builtin eval/.test(d)) {
    const npm = d.match(/\bnpm run \S+/);
    if (npm) return truncate(npm[0], MAX_APPROVAL_CHARS);
    const pkill = d.match(/pkill[^\n;]+/);
    if (pkill) return truncate(pkill[0], MAX_APPROVAL_CHARS);
    return 'Shell command — open Cursor for full command text';
  }

  return truncate(d, MAX_APPROVAL_CHARS);
}
