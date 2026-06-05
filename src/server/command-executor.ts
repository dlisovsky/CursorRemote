import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { CdpClient } from './cdp-client.js';
import type { SelectorConfig, CommandResult, PlanModelOption } from './types.js';

export interface SendPromptOptions {
  text?: string;
  imagePaths?: string[];
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const FOCUS_DELAY_MS = 100;
const ATTACH_VERIFY_TIMEOUT_MS = 2500;
const ATTACH_VERIFY_POLL_MS = 150;

/**
 * Heuristic attachment score in the agent composer panel.
 * Uses several signals because Cursor may render pasted images as canvas,
 * background-image, or nodes outside `.composer-bar`.
 */
export const COMPOSER_ATTACHMENT_SCORE_JS = `
  (() => {
    const aux = document.getElementById('workbench.parts.auxiliarybar');
    const roots = [
      document.querySelector('.composer-bar'),
      aux,
    ].filter(Boolean);
    const keys = new Set();

    const addKey = (k) => { if (k) keys.add(k); };

    const scoreRoot = (root) => {
      for (const img of root.querySelectorAll('img')) {
        const rect = img.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) continue;
        const cls = (img.className || '').toString();
        const src = img.currentSrc || img.getAttribute('src') || '';
        if (/icon|avatar|logo|favicon/i.test(cls)) continue;
        if (/\\.(svg|ico)(\\?|$)/i.test(src)) continue;
        addKey('img:' + (src || rect.top + ':' + rect.left + ':' + rect.width));
      }

      for (const canvas of root.querySelectorAll('canvas')) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width >= 32 && rect.height >= 32) {
          addKey('canvas:' + rect.top + ':' + rect.left + ':' + rect.width);
        }
      }

      for (const el of root.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 32 || rect.height < 32) continue;
        const bg = getComputedStyle(el).backgroundImage || '';
        if (bg.includes('blob:') || bg.includes('data:image')) {
          addKey('bg:' + bg.slice(0, 96));
        }
      }

      for (const chip of root.querySelectorAll(
        '[class*="attachment" i], [class*="Attachment" i], [class*="image-preview" i], ' +
        '[class*="ImagePreview" i], [class*="media-preview" i], [class*="context-pill" i], ' +
        '[data-testid*="attachment" i]'
      )) {
        const rect = chip.getBoundingClientRect();
        if (rect.width >= 28 && rect.height >= 28) {
          addKey('chip:' + (chip.className || '').toString().slice(0, 80));
        }
      }

      for (const input of root.querySelectorAll('input[type=file]')) {
        const files = input.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) addKey('file:' + files[i].name);
        }
      }

      for (const btn of root.querySelectorAll('button[aria-label], [role="button"][aria-label]')) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (!/remove|delete|detach|close image|remove image/.test(label)) continue;
        const rect = btn.getBoundingClientRect();
        if (rect.width < 8) continue;
        addKey('rm:' + label + '@' + Math.round(rect.top));
      }
    };

    for (const root of roots) scoreRoot(root);

    // Media siblings above/near the chat input (common for pasted images).
    const input =
      document.querySelector('.composer-bar [contenteditable="true"]') ||
      document.querySelector('.composer-bar textarea') ||
      aux?.querySelector('[contenteditable="true"]') ||
      aux?.querySelector('textarea');
    if (input) {
      let container = input.parentElement;
      for (let depth = 0; depth < 6 && container; depth++) {
        const cls = (container.className || '').toString();
        if (/composer|aichat|chat-input|prompt/i.test(cls)) {
          scoreRoot(container);
          break;
        }
        container = container.parentElement;
      }
    }

    return keys.size;
  })()
`;

/** @deprecated Use COMPOSER_ATTACHMENT_SCORE_JS */
export const COMPOSER_IMAGE_ATTACHMENT_COUNT_JS = COMPOSER_ATTACHMENT_SCORE_JS;

// Resolves the currently-open model picker menu element across Cursor versions.
// Older builds expose `[data-testid="model-picker-menu"]`; newer builds (~3.5.17)
// removed the testid and render the picker as a generic `[role="menu"]` opened
// via `.ui-model-picker__trigger`, so we cascade through several lookups.
// Stable across model-picker renders — Cursor's React 19 useId-generated IDs
// (`_r_ld_`, `_r_qm_`, …) change on every mount, so they round-trip badly as
// model identifiers. Treat anything matching this pattern as no-id and fall
// back to the synthetic `label::<text>` form.
const REACT_USE_ID_RE = /^_r_[a-z0-9]+_$/;

// Shared in-browser helpers for reading and clicking model-picker rows. Both
// the read path (`get_model_options`) and the write path (`set_model` /
// `set_plan_model`) use the same `collectModelItems()` / `pickModelById()`
// implementations so the round-trip is consistent — there's exactly one
// definition of "what counts as a model row" and "how to map an id back to a
// row." Inject as `${MODEL_ITEM_HELPERS_JS}` inside an evaluate().
export const MODEL_ITEM_HELPERS_JS = `
  const REACT_USE_ID_RE = ${REACT_USE_ID_RE.toString()};

  // Row label, excluding text from descendant <button> elements (each row has
  // an inner "Edit" button whose text would otherwise pollute the label).
  const labelOf = (el) => {
    const clone = el.cloneNode(true);
    for (const b of Array.from(clone.querySelectorAll('button'))) b.remove();
    return (clone.textContent || '').replace(/\\s+/g, ' ').trim();
  };

  // Returns the DOM id only if it's stable; React useId values round-trip badly.
  const stableIdOf = (el) => {
    const raw = el.id || '';
    if (!raw || REACT_USE_ID_RE.test(raw)) return '';
    return raw;
  };

  // Top-level rows under the menu — drops items contained inside another
  // candidate so per-row Edit buttons don't show up as separate "models."
  const modelRowsIn = (menu) => {
    if (!menu) return [];
    const raw = Array.from(menu.querySelectorAll('[id], [role="menuitem"], button, [data-testid]'));
    return raw.filter(item => !raw.some(other => other !== item && other.contains(item)));
  };

  const clickModelRow = (item) => {
    const clickable = item.querySelector('.composer-unified-context-menu-item') || item;
    clickable.click();
  };

  const collectModelItems = (menu) => {
    const items = modelRowsIn(menu);
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const label = labelOf(item);
      if (!label) continue;
      // Skip pure action-button entries that survived the nesting filter
      // (defensive — e.g. floating Edit/Configure buttons not inside a row).
      if (/^(edit|configure|remove|delete|star)$/i.test(label)) continue;
      const stableId = stableIdOf(item);
      const key = stableId || label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const clickable = item.querySelector('.composer-unified-context-menu-item') || item;
      const cls = clickable.className || item.className || '';
      const aria = clickable.getAttribute?.('aria-checked') || item.getAttribute?.('aria-checked') || '';
      const selected = /selected|active|checked/.test(cls) || aria === 'true';
      out.push({
        id: stableId || ('label::' + label),
        label,
        selected,
      });
    }
    return out;
  };

  // Finds and clicks the row whose id (or synthesized label::id) matches the
  // requested target. Targets can be: a real DOM id ("model-opus"), a
  // synthesized "label::<text>" (when the row has no stable id), an unstable
  // React useId ("_r_ld_"), or the bare label text. Returns true on success.
  const pickModelById = (menu, targetId) => {
    if (!menu || !targetId) return false;
    const isLabelId = targetId.startsWith('label::');
    const isUnstable = REACT_USE_ID_RE.test(targetId);
    const labelTarget = (isLabelId ? targetId.slice(7) : '').trim().toLowerCase();
    const targetLc = targetId.toLowerCase();
    const fuzzy = (isLabelId || isUnstable) ? '' : targetLc.replace(/[-_]/g, ' ');

    if (!isLabelId && !isUnstable) {
      const byId = document.getElementById(targetId);
      if (byId && (byId === menu || menu.contains(byId))) {
        clickModelRow(byId);
        return true;
      }
    }

    const rows = modelRowsIn(menu);
    // Pass 1: exact match (preferred — avoids "GPT-5" matching "GPT-5.5").
    for (const item of rows) {
      const label = labelOf(item);
      if (!label) continue;
      const labelLc = label.toLowerCase();
      const stableId = stableIdOf(item);
      if (isLabelId || isUnstable) {
        if (labelLc === labelTarget || labelLc === targetLc) {
          clickModelRow(item);
          return true;
        }
      } else {
        if (stableId === targetId || ('label::' + label) === targetId) {
          clickModelRow(item);
          return true;
        }
      }
    }
    // Pass 2: fuzzy/substring fallback for label::-style targets, in case the
    // live row has extra text (e.g. a "Premium" badge, subtitle) beyond what
    // collectModelItems captured. Guarded by length to avoid partial matches
    // like "GPT-5" matching "GPT-5.5".
    for (const item of rows) {
      const label = labelOf(item);
      if (!label) continue;
      const labelLc = label.toLowerCase();
      if (isLabelId || isUnstable) {
        if (labelTarget.length >= 4 && labelLc.includes(labelTarget)) {
          clickModelRow(item);
          return true;
        }
      } else if (fuzzy && labelLc.includes(fuzzy)) {
        clickModelRow(item);
        return true;
      }
    }
    return false;
  };
`;

// Back-compat alias for tests that imported the old name.
export const MODEL_ITEM_COLLECTOR_JS = MODEL_ITEM_HELPERS_JS;

// Inject as `${MODEL_MENU_LOOKUP_JS}` inside an evaluate; call `findModelMenu()`.
export const MODEL_MENU_LOOKUP_JS = `
  const findModelMenu = () => {
    const byTestId = document.querySelector('[data-testid="model-picker-menu"]');
    if (byTestId) return byTestId;
    const triggers = document.querySelectorAll(
      '.ui-model-picker__trigger[aria-expanded="true"],' +
      '.composer-unified-dropdown-model[aria-expanded="true"],' +
      '.composer-unified-dropdown[aria-expanded="true"]'
    );
    for (const t of Array.from(triggers)) {
      const controls = t.getAttribute('aria-controls');
      if (controls) {
        const byControls = document.getElementById(controls);
        if (byControls) return byControls;
      }
    }
    const openMenu = document.querySelector('[role="menu"][data-state="open"]');
    if (openMenu) return openMenu;
    const visibleMenus = document.querySelectorAll('[role="menu"]:not([hidden])');
    for (const m of Array.from(visibleMenus)) {
      const rect = m.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return m;
    }
    return null;
  };
`;

export class CommandExecutor {
  private selectors: SelectorConfig;
  private client: CdpClient | null = null;

  constructor(selectors: SelectorConfig) {
    this.selectors = selectors;
  }

  setClient(client: CdpClient | null): void {
    this.client = client;
  }

  async sendMessage(commandId: string, text: string): Promise<CommandResult> {
    return this.sendPrompt(commandId, { text });
  }

  async sendPrompt(commandId: string, options: SendPromptOptions): Promise<CommandResult> {
    const text = options.text?.trim() ?? '';
    const imagePaths = options.imagePaths ?? [];
    if (!text && imagePaths.length === 0) {
      return { commandId, ok: false, error: 'Nothing to send' };
    }

    if (!this.client || !this.client.isConnected()) {
      return { commandId, ok: false, error: 'Not connected to Cursor' };
    }

    if (imagePaths.length > 0) {
      const attachResult = await this.attachImagesOnce(this.client, imagePaths);
      if (!attachResult.ok) {
        return { commandId, ok: false, error: attachResult.error };
      }
      await sleep(400 + imagePaths.length * 200);
    }

    return this.withRetry(commandId, async (client) => {
      const focus = await this.focusChatInput(client);
      console.log(`[command-executor] Focused: ${focus.info}`);

      if (imagePaths.length === 0) {
        await client.pressKey('a', 'KeyA', 65, 2);
        await sleep(50);
        await client.pressKey('Backspace', 'Backspace', 8);
        await sleep(50);
      }

      if (text) {
        await client.typeText(text);
        console.log(`[command-executor] Text inserted (${text.length} chars)`);
        await sleep(150);
      }

      await client.pressKey('Enter', 'Enter', 13);
      console.log('[command-executor] Prompt submitted (Enter)');
    });
  }

  private async focusChatInput(client: CdpClient): Promise<{ info: string }> {
    const strategies = this.selectors.chatInput.strategies;
    const result = await client.evaluate(`
      (() => {
        const strategies = ${JSON.stringify(strategies)};
        let input = null;
        let matchedSelector = '';
        for (const sel of strategies) {
          try {
            input = document.querySelector(sel);
            if (input) { matchedSelector = sel; break; }
          } catch {}
        }
        if (!input) return { ok: false, error: 'Chat input not found (tried ' + strategies.length + ' selectors)' };

        const info = input.tagName + '.' + Array.from(input.classList).join('.') + ' | sel=' + matchedSelector;
        input.scrollIntoView({ block: 'center', behavior: 'instant' });
        input.focus();
        input.click();
        return { ok: true, info };
      })()
    `) as { ok: boolean; error?: string; info?: string } | null;

    if (!result?.ok) {
      throw new Error(result?.error ?? 'Failed to focus input');
    }
    await sleep(FOCUS_DELAY_MS);
    return { info: result.info ?? 'chat input' };
  }

  private async measureAttachmentScore(client: CdpClient): Promise<number> {
    const n = await client.evaluate(COMPOSER_ATTACHMENT_SCORE_JS);
    return typeof n === 'number' && n >= 0 ? n : 0;
  }

  private async waitForAttachmentDelta(
    client: CdpClient,
    baseline: number,
    minDelta: number
  ): Promise<boolean> {
    const deadline = Date.now() + ATTACH_VERIFY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const score = await this.measureAttachmentScore(client);
      if (score - baseline >= minDelta) return true;
      await sleep(ATTACH_VERIFY_POLL_MS);
    }
    return false;
  }

  /**
   * Attach images exactly once (never inside withRetry).
   * Success when attachment score rises by at least imagePaths.length, or by ≥1
   * when a single image was requested (counter may under-count albums).
   */
  private async attachImagesOnce(
    client: CdpClient,
    imagePaths: string[]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const baseline = await this.measureAttachmentScore(client);
    const minDelta = imagePaths.length;
    const requiredDelta = minDelta === 1 ? 1 : minDelta;

    const current = await this.measureAttachmentScore(client);
    if (current - baseline >= requiredDelta) {
      console.log('[command-executor] Images already in composer, skipping attach');
      return { ok: true };
    }

    const fileInputStrategies = this.selectors.composerFileInput?.strategies ?? [
      '.composer-bar input[type=file]',
      '#workbench\\.parts\\.auxiliarybar input[type=file]',
      'input[type=file][accept*="image"]',
      'input[type=file]',
    ];

    let attached = await client.setFileInputFiles(fileInputStrategies, imagePaths);

    if (!attached.ok) {
      const attachStrategies = this.selectors.composerAttachButton?.strategies ?? [
        'button[aria-label*="Attach"]',
        'button[aria-label*="attach"]',
      ];
      for (const sel of attachStrategies) {
        try {
          if (await client.exists(sel)) {
            await client.click(sel);
            await sleep(250);
            break;
          }
        } catch { /* try next */ }
      }
      attached = await client.setFileInputFiles(fileInputStrategies, imagePaths);
    }

    if (attached.ok) {
      if (await this.waitForAttachmentDelta(client, baseline, requiredDelta)) {
        console.log(
          `[command-executor] Attached ${imagePaths.length} file(s) via file input (${attached.selector})`
        );
        return { ok: true };
      }
      const delta = (await this.measureAttachmentScore(client)) - baseline;
      if (delta >= 1) {
        console.log(
          `[command-executor] File input attached (score +${delta}, wanted +${requiredDelta})`
        );
        return { ok: true };
      }
      console.log(
        `[command-executor] File input set on ${attached.selector} but score +${delta} (wanted +${requiredDelta}); trying paste`
      );
    }

    const beforePaste = await this.measureAttachmentScore(client);
    if (beforePaste - baseline >= requiredDelta) {
      console.log('[command-executor] Attachments detected before paste, skipping paste');
      return { ok: true };
    }
    try {
      await this.attachImagesViaPaste(client, imagePaths);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }

    await sleep(400);
    if (await this.waitForAttachmentDelta(client, baseline, requiredDelta)) {
      console.log(`[command-executor] Attached ${imagePaths.length} image(s) via paste`);
      return { ok: true };
    }

    const afterPaste = await this.measureAttachmentScore(client);
    const pasteDelta = afterPaste - beforePaste;
    if (pasteDelta >= 1 || afterPaste - baseline >= 1) {
      console.log(
        `[command-executor] Paste likely succeeded (score +${pasteDelta}, total +${afterPaste - baseline})`
      );
      return { ok: true };
    }

    return {
      ok: false,
      error: `Could not verify images in composer (wanted +${requiredDelta}, score +${afterPaste - baseline})`,
    };
  }

  private async attachImagesViaPaste(client: CdpClient, imagePaths: string[]): Promise<void> {
    const strategies = this.selectors.chatInput.strategies;

    for (const imagePath of imagePaths) {
      const buf = readFileSync(imagePath);
      const name = basename(imagePath);
      const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
            : 'image/png';
      const payload = { name, mime, base64: buf.toString('base64') };

      const result = await client.callFunction(
        (inputStrategies: string[], file: { name: string; mime: string; base64: string }) => {
          let input: Element | null = null;
          for (const sel of inputStrategies) {
            try {
              input = document.querySelector(sel);
              if (input) break;
            } catch { /* continue */ }
          }
          if (!input) return { ok: false, error: 'Chat input not found for paste' };

          input.scrollIntoView({ block: 'center', behavior: 'instant' });
          const el = input as HTMLElement;
          el.focus();
          el.click();

          const bin = atob(file.base64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const blob = new File([arr], file.name, { type: file.mime });
          const dt = new DataTransfer();
          dt.items.add(blob);
          el.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
          );
          return { ok: true };
        },
        strategies,
        payload
      ) as { ok: boolean; error?: string };

      if (!result?.ok) {
        throw new Error(result?.error ?? 'Chat input not found for paste');
      }
      await sleep(300);
    }
  }

  async clickApproval(
    commandId: string,
    selectorPath: string
  ): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      await client.click(selectorPath);
    });
  }

  async approveAll(commandId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const selector = await this.findApproveAllButton(client);
      if (!selector) {
        throw new Error('"Accept All" button not found');
      }
      await client.click(selector);
    });
  }

  async reject(
    commandId: string,
    selectorPath: string
  ): Promise<CommandResult> {
    return this.clickApproval(commandId, selectorPath);
  }

  async scrollChatUp(commandId: string, times: number = 5): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const containerSelectors = this.selectors.chatContainer.strategies;
      for (let i = 0; i < times; i++) {
        await client.evaluate(`
          (() => {
            const strategies = ${JSON.stringify(containerSelectors)};
            for (const sel of strategies) {
              try {
                const el = document.querySelector(sel);
                if (el) {
                  const scrollable = el.querySelector('[class*="scroll"]') || el;
                  scrollable.scrollTop = 0;
                  return true;
                }
              } catch {}
            }
            return false;
          })()
        `);
        await sleep(500);
      }
      console.log(`[command-executor] Scrolled chat up ${times} times`);
    });
  }

  async scrollChatToBottom(commandId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const containerSelectors = this.selectors.chatContainer.strategies;
      await client.evaluate(`
        (() => {
          const strategies = ${JSON.stringify(containerSelectors)};
          for (const sel of strategies) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                const scrollable = el.querySelector('[class*="scroll"]') || el;
                scrollable.scrollTop = scrollable.scrollHeight;
                return true;
              }
            } catch {}
          }
          return false;
        })()
      `);
      console.log('[command-executor] Scrolled chat to bottom');
    });
  }

  async switchTab(
    commandId: string,
    tabTitle: string,
    _selectorPath?: string
  ): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const clicked = await client.evaluate(`
        (() => {
          const title = ${JSON.stringify(tabTitle)};
          const norm = s => s.trim().replace(/\\s+/g, ' ').toLowerCase();
          const target = norm(title);
          function cleanTabTitle(raw) {
            let t = (raw || '').trim().replace(/\\s+/g, ' ');
            t = t.replace(/(@[\\w./]+)+\\s*$/, '');
            return t.trim().substring(0, 120);
          }
          function glassCompositeForBtn(btn) {
            const labelEl = btn.querySelector('.ui-sidebar-menu-button-label');
            const rawAgent = (labelEl?.textContent || '').trim();
            if (!rawAgent) return { composite: '', agentOnly: '' };
            const group = btn.closest('.ui-sidebar-group');
            const gt = group?.querySelector('.ui-sidebar-group-label-title');
            const rawGroup = (gt?.textContent || '').trim();
            let composite = cleanTabTitle(rawAgent);
            if (rawGroup) {
              const g = cleanTabTitle(rawGroup);
              if (g) composite = (g + ' / ' + cleanTabTitle(rawAgent)).substring(0, 120);
            }
            return { composite: norm(composite), agentOnly: norm(rawAgent) };
          }
          const glassBtns = Array.from(document.querySelectorAll(
            '.glass-sidebar-agent-list-container li.ui-sidebar-menu-item > div.glass-sidebar-agent-menu-btn'
          ));
          if (glassBtns.length > 0) {
            const rows = glassBtns.map((btn) => ({
              btn,
              ...glassCompositeForBtn(btn),
            })).filter((r) => r.composite);
            const byComp = rows.filter((r) => r.composite === target);
            if (byComp.length === 1) {
              byComp[0].btn.click();
              return true;
            }
            const byAgent = rows.filter((r) => r.agentOnly === target);
            if (byAgent.length === 1) {
              byAgent[0].btn.click();
              return true;
            }
            if (byComp.length > 1 || byAgent.length > 1) {
              throw new Error('Ambiguous tab title for glass sidebar: ' + title);
            }
          }
          const cells = document.querySelectorAll('.agent-sidebar-cell');
          for (const cell of Array.from(cells)) {
            const titleEl = cell.querySelector('.agent-sidebar-cell-text');
            const text = norm(titleEl ? (titleEl.textContent || '') : (cell.textContent || ''));
            if (text === target) {
              cell.click();
              return true;
            }
          }
          for (const cell of Array.from(cells)) {
            const titleEl = cell.querySelector('.agent-sidebar-cell-text');
            const text = norm(titleEl ? (titleEl.textContent || '') : (cell.textContent || ''));
            if (text.startsWith(target) || target.startsWith(text)) {
              cell.click();
              return true;
            }
          }
          return false;
        })()
      `) as boolean;
      if (!clicked) throw new Error('Tab not found: ' + tabTitle);
      console.log(`[command-executor] Switched tab: ${tabTitle}`);
    });
  }

  async newChat(commandId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const strategies = this.selectors.newChatButton?.strategies ?? [];
      const result = await client.evaluate(`
        (() => {
          const strategies = ${JSON.stringify(strategies)};
          for (const sel of strategies) {
            try {
              const el = document.querySelector(sel);
              if (el) { el.click(); return true; }
            } catch {}
          }
          return false;
        })()
      `) as boolean;
      if (!result) throw new Error('New Chat button not found');
      console.log(`[command-executor] New chat created`);
    });
  }

  async setMode(commandId: string, modeId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const strategies = this.selectors.modeDropdown?.strategies ?? [];

      // Click the dropdown trigger to open the menu
      const opened = await client.evaluate(`
        (() => {
          const strategies = ${JSON.stringify(strategies)};
          for (const sel of strategies) {
            try {
              const el = document.querySelector(sel);
              if (el) { el.click(); return true; }
            } catch {}
          }
          return false;
        })()
      `) as boolean;
      if (!opened) throw new Error('Mode dropdown not found');

      await sleep(250);

      // Click the mode item whose ID ends with the modeId
      const selected = await client.evaluate(`
        (() => {
          const modeId = ${JSON.stringify(modeId)};
          const items = document.querySelectorAll('[id*="composer-mode-"][id$="-' + modeId + '"]');
          for (const item of Array.from(items)) {
            const clickable = item.querySelector('.composer-unified-context-menu-item') || item;
            clickable.click();
            return true;
          }
          return false;
        })()
      `) as boolean;
      if (!selected) throw new Error(`Mode "${modeId}" not found in dropdown`);
      console.log(`[command-executor] Mode set to: ${modeId}`);
    });
  }

  async clickAction(commandId: string, selectorPath: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      await client.click(selectorPath);
      console.log(`[command-executor] Clicked action: ${selectorPath.substring(0, 60)}`);
    });
  }

  async extractToolContent(toolCallId: string): Promise<{ code: string; language?: string; filename?: string } | null> {
    if (!this.client || !this.client.isConnected()) return null;

    const result = await this.client.evaluate(`
      (() => {
        const tcId = ${JSON.stringify(toolCallId)};
        const wrapper = document.querySelector('[data-tool-call-id="' + tcId + '"]')
          || document.querySelector('[data-tool-call-id="' + tcId + '"]')?.closest('[data-flat-index]')
          || (() => {
            for (const el of document.querySelectorAll('[data-flat-index]')) {
              const inner = el.querySelector('[data-tool-call-id="' + tcId + '"]');
              if (inner) return el;
            }
            return null;
          })();
        if (!wrapper) return null;

        const wasCollapsed = !!wrapper.querySelector('.composer-tool-former-message');
        if (wasCollapsed) {
          const header = wrapper.querySelector('.composer-tool-former-message') || wrapper.querySelector('.ui-collapsible-header');
          if (header) header.click();
        }

        function extract() {
          // Edit tool: look for code content in the diff viewer
          const codeContent = wrapper.querySelector('.ui-default-code__content');
          if (codeContent) {
            const lines = codeContent.querySelectorAll('.ui-default-code__line-content');
            const code = lines.length > 0
              ? Array.from(lines).map(l => l.textContent || '').join('\\n')
              : (codeContent.textContent || '').trim();

            const headerEl = wrapper.querySelector('.ui-code-block-header');
            const language = headerEl?.getAttribute('data-language') || undefined;
            const filenameEl = wrapper.querySelector('.ui-edit-tool-call__filename')
              || wrapper.querySelector('.ui-code-block-filename');
            const filename = filenameEl ? (filenameEl.textContent || '').trim() : undefined;
            return { code, language, filename };
          }

          // Shell tool output
          const shellOutput = wrapper.querySelector('.composer-terminal-output') || wrapper.querySelector('.xterm-rows');
          if (shellOutput) {
            return { code: (shellOutput.textContent || '').trim(), language: 'bash', filename: undefined };
          }

          // Generic expanded content
          const preEl = wrapper.querySelector('pre');
          if (preEl) {
            return { code: (preEl.textContent || '').trim(), language: undefined, filename: undefined };
          }

          // Full text fallback
          const text = (wrapper.textContent || '').trim();
          if (text.length > 0) return { code: text, language: undefined, filename: undefined };
          return null;
        }

        if (wasCollapsed) {
          return '__NEED_WAIT__';
        }
        return extract();
      })()
    `) as { code: string; language?: string; filename?: string } | '__NEED_WAIT__' | null;

    if (result === '__NEED_WAIT__') {
      await sleep(600);
      const expanded = await this.client.evaluate(`
        (() => {
          const tcId = ${JSON.stringify(toolCallId)};
          const wrapper = document.querySelector('[data-tool-call-id="' + tcId + '"]')
            || (() => {
              for (const el of document.querySelectorAll('[data-flat-index]')) {
                const inner = el.querySelector('[data-tool-call-id="' + tcId + '"]');
                if (inner) return el;
              }
              return null;
            })();
          if (!wrapper) return null;

          const codeContent = wrapper.querySelector('.ui-default-code__content');
          if (codeContent) {
            const lines = codeContent.querySelectorAll('.ui-default-code__line-content');
            const code = lines.length > 0
              ? Array.from(lines).map(l => l.textContent || '').join('\\n')
              : (codeContent.textContent || '').trim();
            const headerEl = wrapper.querySelector('.ui-code-block-header');
            const language = headerEl?.getAttribute('data-language') || undefined;
            const filenameEl = wrapper.querySelector('.ui-edit-tool-call__filename')
              || wrapper.querySelector('.ui-code-block-filename');
            const filename = filenameEl ? (filenameEl.textContent || '').trim() : undefined;
            return { code, language, filename };
          }

          const shellOutput = wrapper.querySelector('.composer-terminal-output') || wrapper.querySelector('.xterm-rows');
          if (shellOutput) {
            return { code: (shellOutput.textContent || '').trim(), language: 'bash', filename: undefined };
          }

          const preEl = wrapper.querySelector('pre');
          if (preEl) return { code: (preEl.textContent || '').trim(), language: undefined, filename: undefined };

          const text = (wrapper.textContent || '').trim();
          if (text.length > 0) return { code: text, language: undefined, filename: undefined };
          return null;
        })()
      `) as { code: string; language?: string; filename?: string } | null;

      // Collapse back
      await this.client.evaluate(`
        (() => {
          const tcId = ${JSON.stringify(toolCallId)};
          const wrapper = document.querySelector('[data-tool-call-id="' + tcId + '"]')
            || (() => {
              for (const el of document.querySelectorAll('[data-flat-index]')) {
                const inner = el.querySelector('[data-tool-call-id="' + tcId + '"]');
                if (inner) return el;
              }
              return null;
            })();
          if (!wrapper) return;
          const header = wrapper.querySelector('.ui-collapsible-header') || wrapper.querySelector('.composer-tool-former-message');
          if (header) header.click();
        })()
      `);

      return expanded;
    }

    return result;
  }

  async setModel(commandId: string, modelId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      const strategies = this.selectors.modelDropdown?.strategies ?? [];

      // Step 1: Open the dropdown via JS .click() (same pattern as setMode).
      // Skip any trigger whose id starts with `plan-exec-model` (those belong
      // to the plan-execution picker, not the composer's model picker) — same
      // filter as openModelMenuAndReadOptions.
      const opened = await client.evaluate(`
        (() => {
          const strategies = ${JSON.stringify(strategies)};
          for (const sel of strategies) {
            try {
              const candidates = document.querySelectorAll(sel);
              for (const c of Array.from(candidates)) {
                const cId = c.getAttribute('id') || '';
                if (cId.startsWith('plan-exec-model')) continue;
                c.click();
                return true;
              }
            } catch {}
          }
          return false;
        })()
      `) as boolean;
      if (!opened) throw new Error('Model dropdown trigger not found');

      await sleep(300);

      // Step 2: Verify menu opened
      const menuVisible = await client.evaluate(`
        (() => {
          ${MODEL_MENU_LOOKUP_JS}
          return findModelMenu() !== null;
        })()
      `) as boolean;
      if (!menuVisible) throw new Error('Model picker did not open');

      // Step 3: Find and click the model item via the shared helper so
      // setModel, setPlanModel, web client, and Telegram all resolve the
      // same way.
      const selected = await client.evaluate(`
        (() => {
          ${MODEL_MENU_LOOKUP_JS}
          ${MODEL_ITEM_HELPERS_JS}
          return pickModelById(findModelMenu(), ${JSON.stringify(modelId)});
        })()
      `) as boolean;
      if (!selected) throw new Error(`Model "${modelId}" not found in dropdown`);

      await sleep(200);

      // Step 4: Verify dropdown closed (confirms selection was accepted)
      const menuStillOpen = await client.evaluate(`
        (() => {
          ${MODEL_MENU_LOOKUP_JS}
          return findModelMenu() !== null;
        })()
      `) as boolean;
      if (menuStillOpen) {
        console.warn(`[command-executor] Model dropdown still open — pressing Escape`);
        await client.pressKey('Escape', 'Escape', 27);
        await sleep(100);
      }

      console.log(`[command-executor] Model set to: ${modelId} (menu closed: ${!menuStillOpen})`);
    });
  }

  async getModelOptions(commandId: string): Promise<CommandResult> {
    const result = await this.withRetryValue(commandId, async (client) => {
      return await this.openModelMenuAndReadOptions(client);
    });
    if (!result.ok) return result;
    return { commandId, ok: true, data: result.data };
  }

  async getPlanModelOptions(commandId: string, selectorPath: string): Promise<CommandResult> {
    const result = await this.withRetryValue(commandId, async (client) => {
      return await this.openPlanModelMenuAndReadOptions(client, selectorPath);
    });
    if (!result.ok) return result;
    return { commandId, ok: true, data: result.data };
  }

  async setPlanModel(commandId: string, selectorPath: string, planModelId: string): Promise<CommandResult> {
    return this.withRetry(commandId, async (client) => {
      await this.openPlanModelMenu(client, selectorPath);
      const selected = await client.evaluate(`
        (() => {
          ${MODEL_MENU_LOOKUP_JS}
          ${MODEL_ITEM_HELPERS_JS}
          return pickModelById(findModelMenu(), ${JSON.stringify(planModelId)});
        })()
      `) as boolean;
      if (!selected) throw new Error(`Plan model "${planModelId}" not found`);

      await sleep(200);
      const menuStillOpen = await client.evaluate(`
        (() => {
          ${MODEL_MENU_LOOKUP_JS}
          return findModelMenu() !== null;
        })()
      `) as boolean;
      if (menuStillOpen) {
        await client.pressKey('Escape', 'Escape', 27);
        await sleep(100);
      }
      console.log(`[command-executor] Plan model set to: ${planModelId}`);
    });
  }

  private async withRetry(
    commandId: string,
    action: (client: CdpClient) => Promise<void>
  ): Promise<CommandResult> {
    if (!this.client || !this.client.isConnected()) {
      return { commandId, ok: false, error: 'Not connected to Cursor' };
    }

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await action(this.client);
        return { commandId, ok: true };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[command-executor] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${lastError}`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    return { commandId, ok: false, error: lastError };
  }

  private async withRetryValue<T>(
    commandId: string,
    action: (client: CdpClient) => Promise<T>
  ): Promise<CommandResult & { data?: T }> {
    if (!this.client || !this.client.isConnected()) {
      return { commandId, ok: false, error: 'Not connected to Cursor' };
    }

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await action(this.client);
        return { commandId, ok: true, data };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[command-executor] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${lastError}`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    return { commandId, ok: false, error: lastError };
  }

  private async openPlanModelMenu(client: CdpClient, selectorPath: string): Promise<void> {
    const opened = await client.evaluate(`
      (() => {
        const selector = ${JSON.stringify(selectorPath)};
        const el = document.querySelector(selector);
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return true;
      })()
    `) as boolean;
    if (!opened) throw new Error('Plan model dropdown trigger not found');

    await sleep(300);
    const menuVisible = await client.evaluate(`
      (() => {
        ${MODEL_MENU_LOOKUP_JS}
        return findModelMenu() !== null;
      })()
    `) as boolean;
    if (!menuVisible) throw new Error('Plan model picker did not open');
  }

  private async openPlanModelMenuAndReadOptions(
    client: CdpClient,
    selectorPath: string
  ): Promise<{ options: PlanModelOption[] }> {
    await this.openPlanModelMenu(client, selectorPath);

    const options = await client.evaluate(`
      (() => {
        ${MODEL_MENU_LOOKUP_JS}
        ${MODEL_ITEM_HELPERS_JS}
        return collectModelItems(findModelMenu());
      })()
    `) as PlanModelOption[];

    await client.pressKey('Escape', 'Escape', 27);
    await sleep(100);
    return { options };
  }

  private async openModelMenuAndReadOptions(
    client: CdpClient
  ): Promise<{ options: PlanModelOption[] }> {
    const strategies = this.selectors.modelDropdown?.strategies ?? [];

    const opened = await client.evaluate(`
      (() => {
        const strategies = ${JSON.stringify(strategies)};
        for (const sel of strategies) {
          try {
            const candidates = document.querySelectorAll(sel);
            for (const c of Array.from(candidates)) {
              const cId = c.getAttribute('id') || '';
              if (!cId.startsWith('plan-exec-model')) {
                c.click();
                return true;
              }
            }
          } catch {}
        }
        return false;
      })()
    `) as boolean;
    if (!opened) throw new Error('Model dropdown trigger not found');

    await sleep(300);

    const menuVisible = await client.evaluate(`
      (() => {
        ${MODEL_MENU_LOOKUP_JS}
        return findModelMenu() !== null;
      })()
    `) as boolean;
    if (!menuVisible) throw new Error('Model picker did not open');

    const options = await client.evaluate(`
      (() => {
        ${MODEL_MENU_LOOKUP_JS}
        ${MODEL_ITEM_HELPERS_JS}
        return collectModelItems(findModelMenu());
      })()
    `) as PlanModelOption[];

    await client.pressKey('Escape', 'Escape', 27);
    await sleep(100);
    return { options };
  }

  private async findFirstMatchingSelector(
    client: CdpClient,
    strategies: string[]
  ): Promise<string | null> {
    for (const selector of strategies) {
      try {
        if (await client.exists(selector)) return selector;
      } catch {
        // invalid selector, skip
      }
    }
    return null;
  }

  private async findApproveAllButton(client: CdpClient): Promise<string | null> {
    const found = await client.evaluate(`
      (() => {
        const keywords = ${JSON.stringify(this.selectors.approveButton.textMatch ?? [])};
        const strategies = ${JSON.stringify(this.selectors.approveButton.strategies)};
        const containerStrategies = ${JSON.stringify(this.selectors.chatContainer.strategies)};
        let root = null;
        for (const sel of containerStrategies) {
          try {
            root = document.querySelector(sel);
            if (root) break;
          } catch {}
        }
        if (!root) root = document.body;

        // Skip menu-trigger buttons (e.g. Cursor's "Auto-Run in Sandbox"
        // mode dropdown) — they open a settings menu, not an approval.
        const isMenuTrigger = (b) => {
          const p = b.getAttribute('aria-haspopup');
          return p === 'menu' || p === 'true' || p === 'listbox';
        };

        for (const selector of strategies) {
          try {
            const buttons = root.querySelectorAll(selector);
            for (const btn of Array.from(buttons)) {
              if (isMenuTrigger(btn)) continue;
              const text = (btn.textContent || '').trim().toLowerCase();
              if (text.includes('all')) {
                btn.scrollIntoView({ block: 'center' });
                btn.click();
                return true;
              }
            }
          } catch {}
        }

        const allButtons = root.querySelectorAll('button');
        for (const btn of Array.from(allButtons)) {
          if (isMenuTrigger(btn)) continue;
          const text = (btn.textContent || '').trim().toLowerCase();
          for (const kw of keywords) {
            if (kw.toLowerCase().includes('all') && text.includes(kw.toLowerCase())) {
              btn.scrollIntoView({ block: 'center' });
              btn.click();
              return true;
            }
          }
        }

        return false;
      })()
    `) as boolean;

    if (!found) {
      throw new Error('"Accept All" button not found');
    }
    return '__clicked_inline__';
  }

  private async clickElementCenter(client: CdpClient, selector: string): Promise<void> {
    const rect = await client.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
      })()
    `) as { x: number; y: number; width: number; height: number } | null;

    if (!rect || rect.width === 0 || rect.height === 0) {
      throw new Error(`Element not clickable: ${selector}`);
    }

    await client.clickAtCoords(rect.x, rect.y);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
