/**
 * Live Telegram E2E runner (QA Layer 2).
 *
 * Drives a REAL Telegram user account (MTProto via gramjs) against your bot in a
 * forum supergroup, captures every inbound message + edit, and checks each turn
 * against the Cursor-faithful contract (scripts/qa-telegram-compare.ts):
 *   one live panel per prompt, edited in place, no message spam.
 *
 * Setup (one-time):
 *   1. Create an app at https://my.telegram.org → get api_id / api_hash.
 *   2. Use a DEDICATED Telegram account (not your main) that is a member of the
 *      bot's supergroup and can post in the target topic.
 *   3. Generate a session string:  tsx scripts/qa-telegram.ts login
 *      → paste phone, code (and 2FA password if set); copy the printed session.
 *
 * Env for `run`:
 *   TELEGRAM_QA_API_ID, TELEGRAM_QA_API_HASH, TELEGRAM_QA_SESSION
 *   TELEGRAM_QA_CHAT      supergroup id (e.g. -1001234567890) or @username
 *   TELEGRAM_QA_BOT       bot @username (to identify bot-authored messages)
 *   TELEGRAM_QA_TOPIC     (optional) forum topic id (message_thread_id) to post into
 *
 * Usage:
 *   tsx scripts/qa-telegram.ts login
 *   tsx scripts/qa-telegram.ts run
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { analyzeTurn, type CapturedEvent } from './qa-telegram-compare.js';

function envInt(name: string): number {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return parseInt(v, 10);
}
function envStr(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try { return (await rl.question(q)).trim(); } finally { rl.close(); }
}

async function login(): Promise<void> {
  const apiId = envInt('TELEGRAM_QA_API_ID');
  const apiHash = envStr('TELEGRAM_QA_API_HASH');
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
  await client.start({
    phoneNumber: () => ask('Phone (intl format, e.g. +15551234567): '),
    password: () => ask('2FA password (blank if none): '),
    phoneCode: () => ask('Login code from Telegram: '),
    onError: (err) => console.error('[qa-telegram] login error:', err),
  });
  console.log('\n[qa-telegram] Session string (store as TELEGRAM_QA_SESSION):\n');
  console.log(client.session.save());
  console.log('\nKeep it secret — it grants full access to this account.');
  await client.disconnect();
}

function connectedClient(): Promise<TelegramClient> {
  const apiId = envInt('TELEGRAM_QA_API_ID');
  const apiHash = envStr('TELEGRAM_QA_API_HASH');
  const session = envStr('TELEGRAM_QA_SESSION');
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 });
  return client.connect().then(() => client);
}

/** Print the QA account's own numeric user id (for TELEGRAM_ALLOWED_USERS / auth). */
async function whoami(): Promise<void> {
  const client = await connectedClient();
  const me = await client.getMe();
  const u = me as { id?: unknown; username?: string; firstName?: string };
  console.log(`id=${String(u.id)} username=@${u.username ?? ''} firstName=${u.firstName ?? ''}`);
  await client.disconnect();
}

/** List the QA account's groups/supergroups so you can pick TELEGRAM_QA_CHAT. */
async function discoverChats(): Promise<void> {
  const client = await connectedClient();
  console.log('\nGroups / supergroups this QA account can see:\n');
  for await (const dialog of client.iterDialogs({})) {
    const e = dialog.entity as { className?: string; megagroup?: boolean; forum?: boolean } | undefined;
    if (!e) continue;
    const isGroup = e.className === 'Channel' && e.megagroup || e.className === 'Chat';
    if (!isGroup) continue;
    const forum = (e as { forum?: boolean }).forum ? ' [forum]' : '';
    console.log(`  ${String(dialog.id).padEnd(16)} ${dialog.title ?? ''}${forum}`);
  }
  console.log('\nSet TELEGRAM_QA_CHAT to the id (e.g. -1001234567890).');
  await client.disconnect();
}

/** List forum topics in a chat so you can pick TELEGRAM_QA_TOPIC. */
async function discoverTopics(): Promise<void> {
  const chatRef = process.argv[3] ?? envStr('TELEGRAM_QA_CHAT');
  const client = await connectedClient();
  const channel = await client.getEntity(chatRef);
  const result = await client.invoke(new Api.channels.GetForumTopics({
    channel, limit: 100, offsetId: 0, offsetDate: 0, offsetTopic: 0,
  }));
  console.log(`\nForum topics in ${chatRef}:\n`);
  for (const t of (result as unknown as { topics: Array<{ id: number; title?: string }> }).topics) {
    console.log(`  ${String(t.id).padEnd(10)} ${t.title ?? ''}`);
  }
  console.log('\nSet TELEGRAM_QA_TOPIC to the topic id you want to test in.');
  await client.disconnect();
}

interface Scenario {
  name: string;
  prompt: string;
  /** How long to observe the topic after sending (ms). */
  observeMs: number;
  /** Keywords that must appear in the final panel (case-insensitive). */
  expectKeywords?: string[];
}

const SCENARIOS: Scenario[] = [
  { name: 'short-answer', prompt: 'Ignore all previous context. Reply with ONLY this exact text: "The answer is 42." Do not add anything else.', observeMs: 60_000, expectKeywords: ['42'] },
  { name: 'streaming', prompt: 'Ignore all previous context. List exactly 3 files from the repo root directory: package.json, tsconfig.json, and README.md. For each, write one short sentence description.', observeMs: 120_000, expectKeywords: ['package.json', 'tsconfig.json'] },
];

async function run(): Promise<void> {
  const apiId = envInt('TELEGRAM_QA_API_ID');
  const apiHash = envStr('TELEGRAM_QA_API_HASH');
  const session = envStr('TELEGRAM_QA_SESSION');
  const chatRef = envStr('TELEGRAM_QA_CHAT');
  const botRef = envStr('TELEGRAM_QA_BOT');
  const topicId = process.env.TELEGRAM_QA_TOPIC ? parseInt(process.env.TELEGRAM_QA_TOPIC, 10) : undefined;

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 });
  await client.connect();

  const chat = await client.getEntity(chatRef);
  const bot = await client.getEntity(botRef);
  const botId = String((bot as { id: unknown }).id);

  const events: CapturedEvent[] = [];
  const capture = (kind: 'new' | 'edit', msg: unknown): void => {
    const m = msg as { id: number; message?: string; senderId?: unknown; replyTo?: { replyToMsgId?: number } };
    events.push({
      kind,
      messageId: m.id,
      fromBot: String(m.senderId) === botId,
      text: m.message ?? '',
      replyTo: m.replyTo?.replyToMsgId,
      ts: Date.now(),
    });
  };
  client.addEventHandler((e) => capture('new', e.message), new NewMessage({ chats: [chatRef] }));
  client.addEventHandler((e) => capture('edit', e.message), new EditedMessage({ chats: [chatRef] }));

  let failures = 0;
  for (const sc of SCENARIOS) {
    console.log(`\n=== Scenario: ${sc.name} ===\n→ ${sc.prompt}`);
    const startTs = Date.now();
    const sent = await client.sendMessage(chat, {
      message: sc.prompt,
      ...(topicId ? { replyTo: topicId } : {}),
    });
    const promptMsgId = sent.id;

    await new Promise(r => setTimeout(r, sc.observeMs));

    const turnEvents = events.filter(e => e.ts >= startTs);
    const analysis = analyzeTurn(turnEvents, promptMsgId, {
      expectKeywords: sc.expectKeywords,
    });
    const ok = analysis.violations.length === 0;
    if (!ok) failures++;
    console.log(`  panel=${analysis.panelId ?? 'none'} edits=${analysis.panelEdits} extra=${analysis.extraBotMessageIds.length}`);
    console.log(`  final: ${analysis.panelFinalText.slice(0, 160).replace(/\n/g, ' ')}`);
    if (ok) console.log('  PASS');
    else for (const v of analysis.violations) console.log(`  FAIL: ${v}`);
  }

  await client.disconnect();
  console.log(`\n${SCENARIOS.length - failures}/${SCENARIOS.length} scenarios passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

const cmd = process.argv[2];
const commands: Record<string, () => Promise<void>> = {
  login,
  run,
  whoami,
  chats: discoverChats,
  topics: discoverTopics,
};
const main = commands[cmd ?? ''];
if (!main) {
  console.error('Usage: tsx scripts/qa-telegram.ts <login|chats|topics [chat]|run>');
  process.exit(2);
}
main().catch((err) => { console.error(err); process.exit(1); });
