# Design System — CursorRemote

## Product Context

- **What this is:** Telegram Mini App for listing local git projects, spawning Cursor SDK agents, and chatting with them from a phone (voice, photos, streaming tool use).
- **Who it's for:** Developers who already use Cursor and want remote agent control without opening the IDE.
- **Space/industry:** Developer tools / AI coding assistants (peers: GitHub Mobile, Linear, Cursor IDE chat).
- **Project type:** Mobile-first app UI inside Telegram WebApp; Chrome mock mode for local dev.

## Aesthetic Direction

- **Direction:** Calm developer workspace
- **Decoration level:** Minimal — utility over brand theater
- **Mood:** Dense but readable dark UI; teal accent for primary actions; no marketing chrome, no decorative gradients
- **Classifier (gstack):** APP UI — not a landing page

### Hard rules (APP UI)

- Calm surface hierarchy, strong typography, few colors
- Cards only when the card **is** the interaction (agent row, queue item, tool call)
- No dashboard-card mosaics, thick borders, or ornamental icons
- Copy is utility language: orientation, status, action — not welcome paragraphs
- Touch targets **≥ 44px** on all interactive controls
- Input font size **≥ 16px** (prevents iOS zoom-on-focus)

## Typography

- **Display/Hero:** Geist Sans 600 — project title on list screen
- **Body:** Geist Sans 400 — chat messages, descriptions
- **UI/Labels:** Geist Sans 500 — buttons, badges, section labels
- **Data/Tables:** Geist Sans 400 with `font-variant-numeric: tabular-nums` where numbers align
- **Code:** monospace via Mantine `ff="monospace"` on tool details; markdown `pre`/`code` in assistant bubbles
- **Loading:** Self-hosted via `@fontsource/geist-sans` (weights 400, 500, 600)
- **Scale:**
  - `xs` — 12px captions, queue labels, thinking lines
  - `sm` — 14px body, chat bubbles, list items
  - `md` — 16px inputs (required minimum on mobile)
  - Title order 4 (TG) / 3 (Chrome) — projects header
  - Title order 5 — agent name in chat header

## Color

- **Approach:** Restrained — Mantine dark scheme + single teal accent
- **Primary:** Mantine `teal` — Send, New agent, user message bubbles (`teal.9`), success tool state
- **Secondary:** Mantine `gray` — idle badges, subtle icons, borders
- **Neutrals:** Mantine dark palette — `body` background, `dark.6` assistant bubbles, `dark.7` tool cards / activity strip, `dark.8` queue items
- **Semantic:**
  - success / completed: `teal`
  - running / info: `blue`
  - warning / force-send: `orange`
  - error: `red`
  - idle / neutral: `gray`
- **Telegram chrome:** Header and WebApp background `#1a1b1e` (matches Mantine dark body)
- **Dark mode:** Default and only scheme (`defaultColorScheme="dark"`). Text off pure white via Mantine dimmed tokens.

## Spacing

- **Base unit:** 8px (Mantine default)
- **Density:** Comfortable on phone; tighter `sm` padding in Telegram vs `md` in Chrome dev
- **Scale:** Use Mantine tokens — `xs` (10), `sm` (12), `md` (16), `lg` (20), `xl` (32)
- **Safe areas (Telegram):** CSS vars `--tg-safe-top`, `--tg-safe-bottom`, `--tg-main-button` set from WebApp API; footer padding `calc(sm + safe-bottom + main-button)`

## Layout

- **Approach:** Single-column mobile; max container `sm` on projects list
- **Grid:** Flex/stack only — no multi-column dashboards
- **Max content width:** Chat bubbles `max-width: 92%`; projects in `Container size="sm"`
- **Border radius:** Mantine `defaultRadius: md`; pills `radius="xl"` on composer icon buttons
- **Projects list:** Accordion `variant="separated"`; default expand only projects **with agents** (max 1 open in Telegram)
- **Chat:** `AppShell` `mode="static"` (grid layout — main never scrolls under footer), compact header (48px TG / 56px Chrome), scrollable main, auto-height footer with `max(env(safe-area-inset-bottom), --tg-safe-bottom)` padding
- **Composer (Telegram + Chrome):** Single row — textarea (flex, left) + attach menu (library / camera) + send or mic (right; send when message ready)
- **Send / Stop:** In-app teal send + red stop bar in both Telegram and Chrome (no native MainButton)

## Components

| Surface | Pattern |
|---------|---------|
| Projects | Accordion → New agent (teal light button) → agent rows (bordered `Paper` buttons) |
| Chat user bubble | `teal.9` fill, right-aligned (`alignSelf: flex-end`) |
| Chat assistant | `dark.6`, markdown body, streaming cursor `▍` |
| Tool calls | `dark.7` bordered card, status badge |
| Activity | Top strip with dots loader when agent running |
| Queue | Collapsible panel above composer; orange "Now" for force-send |
| Empty states | One line, dimmed — no instructional paragraphs in TG |

## Motion

- **Approach:** Minimal-functional
- **Easing:** Mantine defaults
- **Duration:** Scroll-to-bottom `smooth`; loader dots on activity strip
- **Reduced motion:** Respect `prefers-reduced-motion` for future animations (none required today)

## Telegram integration

- **Dev auth:** `MOCK_TG=true` + `VITE_MOCK_TG=true` — Chrome uses mock initData; Mini App uses real initData when present
- **Layout preview:** `VITE_FORCE_TG_UI=true` (set by `npm run dev:chrome`) — two-row composer + project subtitle without real initData
- **TG layout** (`isTelegramLayout()`): hide in-app back button; show project name under agent title; two-row composer
- **Real Telegram only** (`isTelegramWebApp()`): native `BackButton`, safe-area insets, haptic on send/stop, bottom notifications
- Notifications: `bottom-center` in TG, `top-center` in Chrome
- Expand WebApp on launch; sync header/background color to `#1a1b1e`

## Anti-patterns (do not ship)

- Purple/violet gradient heroes or 3-column feature grids
- All projects expanded by default on mobile
- Raw enum strings in UI (`idle` → use `Idle` via `runStatusLabel`)
- Placeholder-only labels without visible labels on focus
- Interactive elements &lt; 44px touch target
- `top-center` toasts overlapping TG native header
- Happy-talk empty states ("Tool use, thinking, and streaming appear here…")

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-09 | Geist Sans + Mantine 7 dark + teal accent | Readable dev-tool aesthetic; avoids generic Inter/Roboto slop |
| 2026-06-09 | Collapsed empty project accordions | Mobile scroll reduction (/design-review FINDING-001) |
| 2026-06-09 | Two-row TG composer | Full-width prompt input on narrow screens (FINDING-TG-001) |
| 2026-06-09 | In-app send/stop (no MainButton) | Consistent controls in TG and Chrome; user preference |
| 2026-06-09 | `VITE_FORCE_TG_UI` for Chrome | Preview TG layout without real Mini App (FINDING-TG-003) |
| 2026-06-09 | Separate photo library + camera icons | User preference for both attach paths |
| 2026-06-09 | DESIGN.md as source of truth | gstack `/design-review`, `/qa`, `/plan-design-review` calibration |

## Review artifacts

- Audit report: `.gstack/design-reports/design-audit-cursorremote-2026-06-09.md` (local, gitignored)
- Screenshots: `.gstack/design-reports/screenshots/` (local, gitignored)
