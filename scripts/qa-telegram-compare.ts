/**
 * Pure comparator for the live Telegram E2E runner (QA Layer 2).
 *
 * The runner (scripts/qa-telegram.ts) drives a real Telegram user account
 * (MTProto/gramjs) against the bot, captures every inbound message + edit as a
 * flat event log, and hands a per-turn slice here. Keeping the assertions pure
 * means the Cursor-faithful contract is unit-tested (tests/turn-renderer-qa-
 * compare.test.ts) without needing live credentials.
 */

export interface CapturedEvent {
  kind: 'new' | 'edit';
  messageId: number;
  /** True when the message is from the bot (not the QA user). */
  fromBot: boolean;
  text: string;
  /** message_id this message replies to (Telegram reply_to), if any. */
  replyTo?: number;
  ts: number;
}

export interface TurnAnalysis {
  /** The single live-panel message id (bot's reply to the prompt), if found. */
  panelId?: number;
  /** Number of edits observed on the live panel. */
  panelEdits: number;
  /** Final rendered text of the live panel. */
  panelFinalText: string;
  /** Bot messages that are NOT the panel (continuation messages, etc.). */
  extraBotMessageIds: number[];
  violations: string[];
}

export interface AnalyzeOptions {
  /** Max continuation messages tolerated for a long final answer. */
  maxContinuation: number;
  /** Require the panel to be edited at least once (streaming happened). */
  requireEdit: boolean;
  /** Expected keywords in the final panel (partial match, case-insensitive). */
  expectKeywords?: string[];
  /** Final panel must NOT still contain a phase header (Writing reply, Processing). */
  rejectPhaseHeaders?: boolean;
}

const DEFAULTS: AnalyzeOptions = { maxContinuation: 4, requireEdit: true, rejectPhaseHeaders: true };

/**
 * Analyze one turn: from the moment the QA user sent `promptMsgId`, the bot must
 * post exactly ONE live panel (a reply to the prompt) and then keep EDITING it —
 * never spamming new messages — except for bounded continuation messages when a
 * long final answer overflows 4096 chars.
 */
export function analyzeTurn(
  events: CapturedEvent[],
  promptMsgId: number,
  options: Partial<AnalyzeOptions> = {},
): TurnAnalysis {
  const opts = { ...DEFAULTS, ...options };
  const violations: string[] = [];

  const botNew = events.filter(e => e.fromBot && e.kind === 'new');
  const panelCandidates = botNew.filter(e => e.replyTo === promptMsgId);

  let panelId: number | undefined;
  if (panelCandidates.length === 0) {
    violations.push('No live panel: bot never replied to the prompt message.');
  } else {
    panelId = panelCandidates[0].messageId;
    if (panelCandidates.length > 1) {
      violations.push(`Message spam: ${panelCandidates.length} bot messages replied to the prompt (expected exactly 1 live panel).`);
    }
  }

  const panelEditsArr = panelId !== undefined
    ? events.filter(e => e.fromBot && e.kind === 'edit' && e.messageId === panelId)
    : [];
  const panelEdits = panelEditsArr.length;
  const panelFinalText = panelEditsArr.at(-1)?.text
    ?? panelCandidates.find(e => e.messageId === panelId)?.text
    ?? '';

  if (panelId !== undefined && opts.requireEdit && panelEdits === 0) {
    violations.push('Live panel was never edited (no streaming observed).');
  }
  if (panelId !== undefined && panelFinalText.trim().length === 0) {
    violations.push('Live panel final text is empty.');
  }
  const doneOnly = /^✅\s*Done$/i.test(panelFinalText.replace(/<[^>]+>/g, '').trim());
  if (panelId !== undefined && doneOnly) {
    violations.push('Live panel shows Done without the agent answer text.');
  }

  // Phase-header residue: final panel should show the answer, not "Writing reply" etc.
  const stripped = panelFinalText.replace(/<[^>]+>/g, '').trim();
  if (panelId !== undefined && opts.rejectPhaseHeaders) {
    const staleHeaders = ['Writing reply', 'Processing', 'Thinking', 'Running tool'];
    for (const h of staleHeaders) {
      if (stripped.startsWith(h)) {
        violations.push(`Final panel still shows phase header "${h}" — should show the answer directly.`);
      }
    }
  }

  // Expected keywords check
  if (panelId !== undefined && opts.expectKeywords) {
    const lower = stripped.toLowerCase();
    for (const kw of opts.expectKeywords) {
      if (!lower.includes(kw.toLowerCase())) {
        violations.push(`Expected keyword "${kw}" not found in final panel text.`);
      }
    }
  }

  // Formatting check: multi-word runs without spaces (e.g. "Node.jsprojectmanifest")
  const wordRun = stripped.match(/[a-z][A-Z][a-z]+[A-Z][a-z]+/g);
  if (panelId !== undefined && wordRun && wordRun.length > 0) {
    violations.push(`Possible space-stripping: "${wordRun[0]}" — words appear joined without spaces.`);
  }

  // Any other brand-new bot message that is NOT the panel = continuation/extra.
  const extraBotMessageIds = botNew
    .filter(e => e.messageId !== panelId)
    .map(e => e.messageId);
  if (extraBotMessageIds.length > opts.maxContinuation) {
    violations.push(`Too many extra bot messages (${extraBotMessageIds.length} > ${opts.maxContinuation}); expected only bounded continuation for long answers.`);
  }

  return { panelId, panelEdits, panelFinalText, extraBotMessageIds, violations };
}
