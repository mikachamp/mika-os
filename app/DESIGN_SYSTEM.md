# Mika OS — Design System

The single reference for how Mika OS looks and behaves: tokens, components, 3D pieces, and
the tools/techniques used to build them. Modelled on a mobile app's design-system doc.

> **Keep this file current.** Any change to colours, typography, components, layouts, or the
> 3D scenes updates this file in the same change, plus a row in the [Changelog](#changelog).
> The code is the source of truth — if this file and the code disagree, fix whichever is wrong.

Source of truth in code:
- Tokens + base components: `renderer/styles.css` (`:root` variables)
- Knowledge Base + graph overlay: `renderer/knowledge.css`
- AI Core scene: `renderer/ai-core-3d.js` · Knowledge graph scene: `renderer/knowledge-graph-3d.js`
- Vault data for both: `vault-graph.js` (IPC `vault:graph`)

---

## 1. Design principles

1. **Dark HUD, one UI accent.** Near-black glass panels over a starfield; cyan is the interface
   accent (nav, links, focus, primary buttons).
2. **The AI is amber, the interface is cyan.** The AI Core figure uses the warm amber/gold of
   the private reference renders (not in this repo). Don't recolour it to cyan —
   the contrast between "entity" and "interface" is deliberate.
3. **Colour means folder in the knowledge views.** The same folder colour is used for graph
   nodes, legend dots, labels and link chips (§2 folder palette).
4. **Reference art is the spec.** When a reference image exists, compare a real render against
   it every round (headless screenshot), never reinterpret it.
5. **Labels on demand, not all at once.** Show names for hubs, the hovered neighbourhood and
   search matches only; hide colliding labels. Everything-labelled-at-once was unreadable.
6. **3D can never crash the app.** Every scene wraps its frame loop in try/catch and degrades
   to a message, and pauses when hidden.

---

## 2. Colour tokens

**Interface (`styles.css :root`)**

| Token | Value | Used for |
|---|---|---|
| `--jarvis-cyan` | `#00d4ff` | Primary accent: active nav, links, wikilinks, focus rings, titles |
| `--jarvis-blue` | `#8b5cf6` | Gradient partner (cyan → violet) on primary buttons |
| `--jarvis-purple` | `#7c3aed` | Secondary accent |
| `--jarvis-magenta` | `#f43f5e` | Sparing highlight |
| `--bg-void` / `--bg-base` | `#000000` | App background (under the starfield) |
| `--bg-card` | `rgba(15,15,15,.65)` | Panels / cards (glass, `backdrop-filter: blur(10px)`) |
| `--bg-surface` / `--bg-elevated` | `rgba(10,10,10,.7)` / `rgba(20,20,20,.6)` | Overlays, raised surfaces |
| `--border` / `--border-accent` | white @ 10% / 15% | Hairlines |
| `--text-primary` / `-secondary` / `-muted` | white @ 100% / 70% / 40% | Text hierarchy |
| `--success` / `--warning` / `--danger` | `#00ffaa` / `#ffaa00` / `#ff0033` | Status |

**Primary button gradient:** `linear-gradient(135deg, rgba(0,212,255,.22), rgba(139,92,246,.22))`
with a `rgba(0,212,255,.45)` border (`.kb-btn-primary`).

**AI Core (amber family, `ai-core-3d.js`)**: linework `#ff8a2a`, highlights `#ffc27a`, eyes /
hottest glow `#fff0d0`, armour fill `#1a0d06`. Frame glow `rgba(255,157,66,…)`.

**Knowledge folder palette (`knowledge-graph-3d.js` `FOLDER_COLORS`)**

| Folder | Colour | Folder | Colour |
|---|---|---|---|
| Root (Home core) | `#ffd9a0` | Skills | `#c084fc` |
| MOCs | `#ffb547` | MCP | `#f472b6` |
| Projects | `#4fc3f7` | Tasks | `#facc15` |
| Notes | `#8b9dff` | Templates | `#94a3b8` |
| Agents | `#3ecf8e` | Logs | `#6b7f99` (muted — most numerous, least important) |
| System | `#00d4ff` | new folders | cycle `#fb923c #2dd4bf #a3e635 #e879f9 #38bdf8` |

Graph background: radial `#0d1426 → #070a12 → #04060b`. Base edges `#8fb4ff` @ 22%.

---

## 3. Typography, geometry, motion

- **Fonts:** Montserrat (UI, headings, labels) · JetBrains Mono (paths, dates, code chips) ·
  Material Symbols Outlined (icons).
- **Styles:** page titles uppercase, letter-spaced, cyan; section labels 10px/700 uppercase
  +1.2px tracking, muted; body 12–13px; panel titles 18px/700.
- **Radius:** `--radius-sm 6` · `md 10` · `lg 14` (panels) · `xl 20` · pills `999px` (labels, chips).
- **Motion:** UI transitions `0.15–0.3s ease`; overlay fade-in `0.35s`; side panel slide `0.25s`;
  camera fly-to `0.9s` ease-in-out-quad; graph idle orbit `autoRotateSpeed 0.35`.

---

## 4. Components

| Component | Where | Notes |
|---|---|---|
| Glass panel (`.widget-panel`, `.briefing-content`, `.kb-sidebar`) | styles.css / knowledge.css | `--bg-card` + hairline border + `--radius-lg` + blur |
| Buttons `.kb-btn` / `.kb-btn-primary` | knowledge.css | Icon + label; primary = cyan→violet gradient |
| Collapsible folder group `.kb-group` | knowledge.css | `<details>`, uppercase label + count pill; Logs collapsed by default |
| Note list item `.kb-item` | knowledge.css | Title (12.5/600) + 2-line clamped summary; active = cyan tint + border |
| Wikilink `.wikilink` | knowledge.css | Cyan dashed underline → solid on hover; `.missing` = muted, not clickable |
| Graph label `.kg-label` | knowledge.css | Pill on dark glass, border tinted with the node's folder colour (`--kg-color`); `.hub`, `.core`, `.focus`, `.kg-collide` (hidden) |
| Link chip `.kg-chip` | knowledge.css | Pill tinted by folder colour; clicking selects that note |
| Side panel `.kg-panel` | knowledge.css | Folder (coloured) → title → path (mono) → summary → linked notes → primary action |
| Graph top bar / legend / hint | knowledge.css | Title + stats left, search + close right; legend bottom-left, hint bottom-right |
| AI Core frame `.core-3d-frame` | styles.css | 380px circle, amber rim glow; hosts the AI figure canvas |

---

## 5. 3D scenes

### AI Core figure — `ai-core-3d.js`
Procedural armoured humanoid matched to a private reference render (not in this repo).
- **Anatomy:** lathe torso with a broad V chest → defined waist → hips; angled hexagonal ab
  plates; pectoral plates with chest-circuit light dashes; layered shoulder armour with joint
  lights; arms with bicep/forearm plates, light strips and wrist cuffs; large hands. Head:
  skull + face plate, cheek plates, brow light, forehead hex, ear discs, crest seam.
- **Look:** dark `MeshStandardMaterial` body + amber `EdgesGeometry` lines (`polygonOffset`
  so back lines hide) · `UnrealBloomPass` with only the tight blur levels
  (`bloomFactors [1,.7,.25,0,0]`, threshold .26) · moving key + rim `PointLight`s · ambient dust.
- **Brightness hierarchy:** outline lines at 82% amber; eyes, chest core and joint lights
  pushed above 1.0 (`HalfFloat` target) so bloom makes them the focal points.
- **Idle:** chest breathing (±1.2%), slight float, head drift, and a holographic scan line
  that sweeps head-to-hip every 6.5 s.
- **Interaction:** `Raycaster` on invisible pick spheres per hand → arm lerps rest→reach pose,
  palm grows a node-graph orb; a larger "hold" sphere keeps the arm raised while the cursor
  follows it. Head tracks the cursor. Brightness follows fleet health (`setActivity`).
- **API:** `window.AICore3D = { setActivity, pause, resume }` (paused while the graph is open).

### 3D Knowledge Graph — `knowledge-graph-3d.js`
Built to `KNOWLEDGE_BASE_3D_NETWORK_CONCEPT.md`.
- **Data:** notes + resolved `[[wikilinks]]` from `vault-graph.js` (full path first, then
  bare name; handles `|alias`, `#heading`, table-escaped `\|`). Size = √(link count), colour =
  folder, Home pinned at the centre.
- **Layout:** solved once before the first frame (420 steps: all-pairs repulsion, link
  springs, folder cohesion, weak gravity, clamped + damped velocity) → **no live physics, no
  jitter**. Idle = slow auto-orbit + tiny per-node sine bob.
- **Rendering:** shared sphere geometry + `MeshBasicMaterial` per node · additive radial-gradient
  `Sprite` halo · `LineSegments` for edges (dim base layer + bright focus layer) ·
  `FogExp2(0.012)` for depth · `CSS2DRenderer` HTML labels.
- **Interaction:** `OrbitControls` (damped) · hover = neighbourhood lit, rest dimmed to 12% ·
  click = camera fly-to sized to the node's neighbourhood + side panel · search dims
  non-matches, Enter flies to the best match · Esc / ✕ close (clicks on empty space only
  deselect).
- **Readability:** camera framed on the 80th-percentile radius (outliers ignored) · labels
  truncated at 34 chars · screen-space declutter every 4 frames (focus > core > degree).

---

## 6. Tools & tech

| Job | Tool |
|---|---|
| 3D engine | three.js `^0.186.1` (local `node_modules`, via import map in `index.html`) |
| Camera controls / labels / glow | three addons: `OrbitControls`, `CSS2DRenderer`, `EffectComposer` + `UnrealBloomPass` + `OutputPass` |
| Vault parsing | plain Node (`vault-graph.js`), served over Electron IPC |
| Shell | Electron 31, `contextIsolation` on, `nodeIntegration` off |
| Visual testing | Puppeteer (`puppeteer-core`) + cached headless Chromium, mocked `window.agentOS`, real vault data via `exposeFunction`; screenshots + numeric checks |
| Reference art | private, not in this repo |
| Process rules | `obsidian/Notes/Three.js Playbook.md` |

---

## 7. Known pitfalls

- `--glow-sm/md/lg` and `--border-glow` still hold the **old orange/magenta** values from the
  pre-cyan theme — anything using them glows orange. Retune to cyan/violet when next touched.
- CSS `url()` resolves from the stylesheet; HTML `src` from `index.html`; `main.js` paths from
  `app/`. Renderer assets belong in `renderer/assets/`.
- Bare `import 'three'` only works because of the import map — keep it when adding modules.
- Headless screenshots are the only way to verify 3D here (no GUI access); jsdom can't render WebGL.

---

## Changelog

| Date | Change |
|---|---|
| 2026-10-13 | AI Core refined against the reference: V-chest/waist proportions, hex abs, chunkier armour, bigger head + hands, brightness hierarchy, breathing + scan-line idle, roomier framing. |
| 2026-10-13 | Document created from current code: tokens, folder palette, components, AI Core + 3D Knowledge Graph techniques, tools, pitfalls. |
| 2026-10-13 | 2D canvas Neural Graph replaced by the 3D Knowledge Graph; Knowledge Base page rebuilt (all notes, folders, search, wikilinks). |
| 2026-10-13 | AI Core regenerated as an armoured amber figure with bloom, hand-raise + palm node orb. |
