import { tgKeyboard, type TgKeyboard } from '../tg-types.js';
import {
  escapeHtml,
  splitMessage,
  formatApprovals,
  formatComposerQueue,
  agentStopKeyboard,
} from '../formatter.js';
import type { TurnState, TurnPhase } from './turn-state.js';

const TG_MSG_LIMIT = 4096;
/** Leave headroom under the hard cap for safety / parse-mode quirks. */
const LIVE_LIMIT = 3900;

export type HashCallback = (selectorPath: string) => string;

export interface RenderedTurn {
  /** HTML for the single live panel (edited in place). */
  liveHtml: string;
  /** Inline keyboard for the live panel, or undefined to clear it. */
  keyboard?: TgKeyboard;
  /** Extra messages appended below the panel (only when a final answer overflows). */
  continuation: string[];
}

/**
 * Callback data for the freeform "Other" option: `qfo:<hash>`, where hash maps
 * back to the option's selector path (same scheme as `qan`). Tapping it arms
 * the topic to capture the user's next message as the freeform answer (C1).
 */
export function freeformCallback(hash: string): string {
  return `qfo:${hash}`;
}

function phaseIcon(phase: TurnPhase): string {
  switch (phase) {
    case 'received': return '⏳';
    case 'thinking': return '💭';
    case 'running_tool': return '🛠';
    case 'answering': return '✍️';
    case 'awaiting_question': return '❓';
    case 'awaiting_approval': return '⚠️';
    case 'queued': return '📥';
    case 'done': return '✅';
    case 'stopped': return '⏹';
    case 'error': return '⚠️';
  }
}

function header(state: TurnState): string {
  const icon = phaseIcon(state.phase);
  const lines = [`${icon} <b>${escapeHtml(state.pinned.statusLabel)}</b>`];
  if (state.pinned.activeTool) lines.push(`<i>${escapeHtml(state.pinned.activeTool)}</i>`);
  return lines.join('\n');
}

/** Header + rolling tail, dropping oldest tail lines until it fits LIVE_LIMIT. */
function clampLiveBody(headerHtml: string, tail: string[]): string {
  const lines = tail.slice();
  while (lines.length > 0) {
    const body = lines.map(l => `<i>${escapeHtml(l)}</i>`).join('\n');
    const full = body ? `${headerHtml}\n\n${body}` : headerHtml;
    if (full.length <= LIVE_LIMIT) return full;
    lines.shift(); // drop oldest
  }
  return headerHtml.slice(0, LIVE_LIMIT);
}

function questionFrame(state: TurnState, hash: HashCallback): RenderedTurn {
  const q = state.question!;
  const activeIdx = q.activeIndex >= 0 ? q.activeIndex : q.questions.findIndex(x => x.isActive);
  const idx = activeIdx >= 0 ? activeIdx : 0;
  const lines: string[] = [`❓ <b>${escapeHtml(q.totalLabel || 'Question')}</b>`];
  for (let i = 0; i < q.questions.length; i++) {
    const qq = q.questions[i];
    lines.push('');
    lines.push(`${i === idx ? '👉 ' : ''}<b>${escapeHtml(qq.number)}</b> ${escapeHtml(qq.text)}`);
    for (const opt of qq.options) {
      lines.push(`  <b>${escapeHtml(opt.letter)})</b> ${escapeHtml(opt.label)}`);
    }
  }

  const kb = tgKeyboard();
  const active = q.questions[idx];
  for (const opt of active.options) {
    if (opt.isFreeform) {
      kb.text(`${opt.letter}) ${opt.label}`, freeformCallback(hash(opt.selectorPath)));
    } else {
      kb.text(`${opt.letter}) ${opt.label}`, `qan:${hash(opt.selectorPath)}`);
    }
    kb.row();
  }
  if (q.skipSelectorPath) kb.text('⏭ Skip', `qsk:${hash(q.skipSelectorPath)}`);
  if (q.continueSelectorPath && !q.continueDisabled) {
    kb.text('▶ Continue', `qco:${hash(q.continueSelectorPath)}`);
  }
  kb.row();
  kb.text('⏹ Cancel', 'stp:');

  return { liveHtml: clampToLimit(lines.join('\n')), keyboard: kb.build(), continuation: [] };
}

function approvalFrame(state: TurnState, hash: HashCallback): RenderedTurn {
  const { html, keyboard } = formatApprovals(state.approvals, hash, { includeStop: true });
  return { liveHtml: clampToLimit(html), keyboard, continuation: [] };
}

function queueFrame(state: TurnState, hash: HashCallback): RenderedTurn {
  const { html, keyboard } = formatComposerQueue(state.queue, hash);
  const headerHtml = header(state);
  const body = html ? `${headerHtml}\n\n${html}` : headerHtml;
  return { liveHtml: clampToLimit(body), keyboard, continuation: [] };
}

function clampToLimit(html: string): string {
  if (html.length <= LIVE_LIMIT) return html;
  return `${html.slice(0, LIVE_LIMIT - 1)}…`;
}

/** Build the renderable view of a turn: live panel HTML + keyboard + overflow. */
export function renderTurn(state: TurnState, hash: HashCallback): RenderedTurn {
  switch (state.phase) {
    case 'awaiting_question':
      if (state.question) return questionFrame(state, hash);
      break;
    case 'awaiting_approval':
      if (state.approvals.length) return approvalFrame(state, hash);
      break;
    case 'queued':
      return queueFrame(state, hash);
    case 'done': {
      const answer = state.finalAnswerHtml?.trim();
      if (!answer) {
        return { liveHtml: `✅ <b>Done</b>`, keyboard: undefined, continuation: [] };
      }
      const parts = splitMessage(answer, TG_MSG_LIMIT);
      return { liveHtml: parts[0], keyboard: undefined, continuation: parts.slice(1) };
    }
    case 'stopped':
      return { liveHtml: `⏹ <b>Stopped</b>`, keyboard: undefined, continuation: [] };
    case 'error':
      return { liveHtml: `⚠️ <b>Agent error</b>`, keyboard: undefined, continuation: [] };
    default:
      break;
  }
  // Live streaming phases: received / thinking / running_tool / answering.
  const headerHtml = clampLiveBody(header(state), state.scrollTail);
  const streaming = state.finalAnswerHtml?.trim();
  if (streaming && state.phase !== 'received') {
    const body = headerHtml ? `${headerHtml}\n\n${streaming}` : streaming;
    return { liveHtml: clampToLimit(body), keyboard: agentStopKeyboard(), continuation: [] };
  }
  return { liveHtml: headerHtml, keyboard: agentStopKeyboard(), continuation: [] };
}
