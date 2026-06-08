/**
 * Local web login for the QA Telegram user (MTProto / gramjs).
 *
 * Starts a localhost-only page where you enter your api_id / api_hash / phone,
 * the login code Telegram sends, and (if set) your 2FA password. It then prints
 * a StringSession you paste into .env as TELEGRAM_QA_SESSION for the E2E runner
 * (scripts/qa-telegram.ts).
 *
 * Usage:
 *   tsx scripts/qa-telegram-login-server.ts        # opens on http://127.0.0.1:8765
 *   PORT=9000 tsx scripts/qa-telegram-login-server.ts
 *
 * Security: binds to 127.0.0.1 only. The session string grants full access to
 * the account — keep it secret and use a DEDICATED QA account, never your main.
 */
import 'dotenv/config';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

type Stage = 'starting' | 'code' | 'password' | 'done' | 'error';

interface LoginState {
  client: TelegramClient;
  stage: Stage;
  resolvers: { code?: (v: string) => void; password?: (v: string) => void };
  session?: string;
  error?: string;
  lastError?: string;
  createdAt: number;
}

const sessions = new Map<string, LoginState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function gc(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > STATE_TTL_MS) {
      s.client.disconnect().catch(() => {});
      sessions.delete(id);
    }
  }
}
setInterval(gc, 60_000).unref();

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  const prefill = JSON.stringify({
    apiId: process.env.TELEGRAM_QA_API_ID ?? '',
    apiHash: process.env.TELEGRAM_QA_API_HASH ?? '',
    phone: process.env.TELEGRAM_QA_PHONE ?? '+905347744358',
  });
  res.type('html').send(PAGE.replace('/*__PREFILL__*/', `window.__PREFILL=${prefill};`));
});

app.post('/api/start', async (req, res) => {
  try {
    const apiId = parseInt(String(req.body.apiId ?? ''), 10);
    const apiHash = String(req.body.apiHash ?? '').trim();
    const phone = String(req.body.phone ?? '').trim();
    if (!apiId || !apiHash || !phone) {
      res.status(400).json({ error: 'apiId, apiHash and phone are required' });
      return;
    }

    const id = randomBytes(12).toString('hex');
    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
    const state: LoginState = { client, stage: 'starting', resolvers: {}, createdAt: Date.now() };
    sessions.set(id, state);

    const waitFor = (stage: 'code' | 'password'): Promise<string> => {
      state.stage = stage;
      return new Promise<string>((resolve) => { state.resolvers[stage] = resolve; });
    };

    // Drive the high-level login flow; each callback parks until the matching
    // HTTP step arrives. The password callback only fires when 2FA is enabled.
    client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => waitFor('code'),
      password: async () => waitFor('password'),
      onError: (err) => { state.lastError = err instanceof Error ? err.message : String(err); },
    }).then(() => {
      state.session = client.session.save() as unknown as string;
      state.stage = 'done';
      client.disconnect().catch(() => {});
    }).catch((err) => {
      state.stage = 'error';
      state.error = err instanceof Error ? err.message : String(err);
      client.disconnect().catch(() => {});
    });

    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/status', (req, res) => {
  const state = sessions.get(String(req.query.id ?? ''));
  if (!state) { res.status(404).json({ error: 'unknown session' }); return; }
  res.json({ stage: state.stage, session: state.session, error: state.error, lastError: state.lastError });
});

app.post('/api/code', (req, res) => {
  const state = sessions.get(String(req.body.id ?? ''));
  if (!state?.resolvers.code) { res.status(409).json({ error: 'not awaiting a code' }); return; }
  const resolve = state.resolvers.code;
  state.resolvers.code = undefined;
  state.stage = 'starting';
  resolve(String(req.body.code ?? '').trim());
  res.json({ ok: true });
});

app.post('/api/password', (req, res) => {
  const state = sessions.get(String(req.body.id ?? ''));
  if (!state?.resolvers.password) { res.status(409).json({ error: 'not awaiting a password' }); return; }
  const resolve = state.resolvers.password;
  state.resolvers.password = undefined;
  state.stage = 'starting';
  resolve(String(req.body.password ?? ''));
  res.json({ ok: true });
});

const PORT = parseInt(process.env.PORT ?? '8765', 10);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n[qa-telegram-login] Open http://127.0.0.1:${PORT} to log in as your QA Telegram user.`);
  console.log('[qa-telegram-login] Binds to localhost only. Use a dedicated QA account.\n');
});

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QA Telegram Login</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f1115; color: #e6e8eb; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
  .card { width: 100%; max-width: 460px; background: #171a21; border: 1px solid #262b36; border-radius: 14px;
    padding: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; color: #9aa3af; font-size: 13px; }
  label { display: block; font-size: 12px; color: #9aa3af; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
  input { width: 100%; padding: 11px 12px; border-radius: 9px; border: 1px solid #2c323d; background: #0f1115; color: #e6e8eb; font-size: 15px; }
  input:focus { outline: none; border-color: #3b82f6; }
  button { margin-top: 18px; width: 100%; padding: 12px; border: 0; border-radius: 9px; background: #3b82f6; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .step { display: none; }
  .step.active { display: block; }
  .err { color: #f87171; font-size: 13px; margin-top: 10px; min-height: 18px; }
  .ok { color: #34d399; }
  .session { width: 100%; height: 120px; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
  .hint { font-size: 12px; color: #9aa3af; margin-top: 10px; }
  .row { display: flex; gap: 8px; }
  .row button { margin-top: 0; }
  code { background: #0f1115; padding: 2px 5px; border-radius: 4px; border: 1px solid #2c323d; }
</style>
</head>
<body>
<div class="card">
  <h1>QA Telegram Login</h1>
  <p class="sub">Sign in as your dedicated QA account to generate a session for the E2E runner.</p>

  <div class="step active" id="step-creds">
    <label>API ID</label>
    <input id="apiId" inputmode="numeric" placeholder="123456" />
    <label>API Hash</label>
    <input id="apiHash" placeholder="abcdef0123456789abcdef0123456789" />
    <label>Phone (international)</label>
    <input id="phone" placeholder="+15551234567" />
    <button id="btn-start">Send login code</button>
    <div class="err" id="err-creds"></div>
    <p class="hint">Get api_id / api_hash from <code>my.telegram.org</code> → API development tools.</p>
  </div>

  <div class="step" id="step-code">
    <label>Login code</label>
    <input id="code" inputmode="numeric" placeholder="12345" />
    <button id="btn-code">Verify code</button>
    <div class="err" id="err-code"></div>
    <p class="hint">Telegram sent a code to your other logged-in devices (or SMS).</p>
  </div>

  <div class="step" id="step-password">
    <label>2FA password</label>
    <input id="password" type="password" placeholder="cloud password" />
    <button id="btn-password">Submit password</button>
    <div class="err" id="err-password"></div>
  </div>

  <div class="step" id="step-done">
    <p class="ok">Logged in. Copy this into your <code>.env</code> as <code>TELEGRAM_QA_SESSION</code>:</p>
    <textarea class="session" id="session" readonly></textarea>
    <div class="row">
      <button id="btn-copy">Copy</button>
    </div>
    <p class="hint">Keep it secret — it grants full access to this account.</p>
  </div>

  <div class="step" id="step-error">
    <p class="err" id="fatal"></p>
    <button onclick="location.reload()">Start over</button>
  </div>
</div>

<script>
  let id = null;
  const $ = (s) => document.querySelector(s);
  function show(step) {
    document.querySelectorAll('.step').forEach(e => e.classList.remove('active'));
    $('#step-' + step).classList.add('active');
  }
  async function post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  let polling = false;
  async function poll() {
    if (polling || !id) return;
    polling = true;
    try {
      const r = await fetch('/api/status?id=' + id);
      const s = await r.json();
      if (s.stage === 'code') show('code');
      else if (s.stage === 'password') show('password');
      else if (s.stage === 'done') { $('#session').value = s.session || ''; show('done'); return; }
      else if (s.stage === 'error') { $('#fatal').textContent = s.error || 'Login failed'; show('error'); return; }
      if (s.lastError) {
        const box = document.querySelector('.step.active .err');
        if (box) box.textContent = s.lastError;
      }
    } catch (e) { /* ignore transient */ }
    finally { polling = false; }
    setTimeout(poll, 1200);
  }

  $('#btn-start').onclick = async () => {
    $('#err-creds').textContent = '';
    $('#btn-start').disabled = true;
    try {
      const res = await post('/api/start', {
        apiId: $('#apiId').value, apiHash: $('#apiHash').value, phone: $('#phone').value,
      });
      id = res.id;
      poll();
    } catch (e) {
      $('#err-creds').textContent = e.message;
      $('#btn-start').disabled = false;
    }
  };

  $('#btn-code').onclick = async () => {
    $('#err-code').textContent = '';
    try { await post('/api/code', { id, code: $('#code').value }); show('creds'); $('#step-creds').classList.remove('active'); poll(); }
    catch (e) { $('#err-code').textContent = e.message; }
  };

  $('#btn-password').onclick = async () => {
    $('#err-password').textContent = '';
    try { await post('/api/password', { id, password: $('#password').value }); poll(); }
    catch (e) { $('#err-password').textContent = e.message; }
  };

  $('#btn-copy').onclick = async () => {
    $('#session').select();
    try { await navigator.clipboard.writeText($('#session').value); $('#btn-copy').textContent = 'Copied'; }
    catch { document.execCommand('copy'); }
  };

  // Prefill from env (injected) then query string for convenience.
  /*__PREFILL__*/
  const pf = window.__PREFILL || {};
  if (pf.apiId) $('#apiId').value = pf.apiId;
  if (pf.apiHash) $('#apiHash').value = pf.apiHash;
  if (pf.phone) $('#phone').value = pf.phone;
  const q = new URLSearchParams(location.search);
  if (q.get('apiId')) $('#apiId').value = q.get('apiId');
  if (q.get('apiHash')) $('#apiHash').value = q.get('apiHash');
</script>
</body>
</html>`;
