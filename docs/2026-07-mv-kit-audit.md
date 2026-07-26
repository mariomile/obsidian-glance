# mv-kit audit — Glance (wave 6)

Audit of `styles.css` (242 lines — smallest of the four repos audited so far)
plus the UI code under `src/` (`card.ts`, `editor.ts`, `reading.ts`,
`settings.ts`) against `obsidian-cosmos-theme/docs/mv-kit.md`, both desktop
and phone columns. Scope: coherence-only fixes (radius / type / icons /
motion tokens / empty states / microcopy). No layout redesign, no DOM
restructure — per `docs/2026-07-24-suite-coherence-design.md` §C/D
non-goals.

**Domain note.** Glance renders inline link-cards in the editor via a CM6
`StateField` (`editor.ts`) and mirrors the same card in Reading mode
(`reading.ts`); `card.ts` owns the actual DOM. There is no modal, popover,
or settings-tab custom form — the settings tab (`settings.ts`) delegates
entirely to Obsidian's native `Setting`/`PluginSettingTab` API. The plugin's
only "surfaces" for mv-kit purposes are the cards themselves and their three
visual states: **loading** (`.is-loading` skeleton, `createSkeleton()` in
`card.ts`), **normal** (`renderMetadata()`), and **degraded**
(`.is-degraded`, a normal card rendered with reduced min-height when the
fetcher only recovered partial/fallback metadata — see `store.ts`
`isFresh()`/`DEGRADED_TTL_MS`). These three states are what §4 and §5 are
evaluated against; there is no separate "No preview available" empty-state
message anywhere in the codebase (confirmed via grep — the degraded card
still renders a title, just a domain-fallback one from the fetcher).

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason).

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — before this wave, `styles.css` consumed **zero** suite tokens. It now consumes `--mv-r-card` (card radius), `--mv-r1` (icon-button radius), `--cosmos-t-fast`/`--mv-wash` (hover-wash transition), `--cosmos-t-fast`/`--mv-lift` (icon-button opacity transition), `--cosmos-touch-min` (phone tap targets), and the forward-proposed `--cosmos-t-spin`/`--cosmos-t-shimmer` (loading-indicator durations, §3) — each with a literal fallback equal to Glance's pre-fix value, so a Cosmos-less vault renders byte-identically. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass** — Glance only ever defines its own `.glance-*` class namespace; no `:root` block exists in `styles.css` at all. |

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.glance-card` container radius | was hardcoded `10px` | same rule, no phone override | **fixed** — now `var(--mv-r-card, 10px)`. Kept Glance's own literal (`10px`) as the fallback rather than silently snapping to the canonical `11px`, matching the precedent set by TabX wave 4 (`--tabx-radius` kept its own `9px` fallback) — the kit names a token *slot*, not a mandate to visually match every plugin's card to the exact canonical pixel value. |
| `.glance-card__refresh` / `.glance-card__copy` icon-button radius | was hardcoded `7px` | same rule, buttons pinned visible via `opacity: 1` in the phone media query | **fixed** — now `var(--mv-r1, 7px)`, the suite-wide chip/toolbar-control radius token (kit §1: "any plugin-defined radius that visually matches … chip consumes the matching token … not a hand-picked pixel value"). Kept `7px` as the literal fallback (Glance's own prior value) rather than snapping to the canonical `6px`, same reasoning as the card radius above. |
| `.glance-card__media` / `.glance-card__skeleton-media` radius (`8px`) | same | phone media query resizes the box but doesn't touch radius | **waived** — this is an inner media-crop corner, not a "pill/card/chip" *surface* in the kit's §1 sense (no entry in the kit's radius table maps to "thumbnail crop inside a card"). |
| `.glance-card__favicon` radius (`3px`) | same | same | **waived** — a 14×14px favicon corner-rounding, same reasoning as media crop: not a pill/card/chip surface, just a tiny decorative image mask. |
| `.glance-card__skeleton-line` radius (`5px`) | same | same | **waived** — skeleton shimmer bar, not a surface the kit's radius table addresses. |
| Elevation shadow on `.glance-card__refresh`/`.glance-card__copy` | `var(--shadow-s, 0 1px 2px rgb(0 0 0 / 12%))` — already a native-token consumption with literal fallback | same | **pass** — these are small in-card icon buttons, not the kit's "floating surfaces" (menus/popovers/panels) that `--cosmos-pop-shadow` targets; the existing native-token pattern is already theme-independent and correctly scoped. |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.glance-card__refresh` / `.glance-card__copy` tap target | `28×28px` (below 44px, but desktop has no touch-min requirement per kit) | was still `28×28px` — the phone media query (`@media max-width: 600px`) only flips `opacity: 0 → 1` to keep the buttons permanently visible on touch (no hover state), it never resized the hit area | **fixed on phone** — added `min-width`/`min-height: var(--cosmos-touch-min, 44px)` inside the phone media query. Desktop unchanged (kit: "N/A (no minimum enforced)" for desktop); the visual button glyph stays the same size, only the hit area grows via `padding`, matching the pattern Sonar/TabX used for their icon-buttons. |
| Card itself as a tap target (whole card is a click surface via `.glance-card__link`, `position: absolute; inset: 0`) | comfortably >44px (`min-height: 84px`) | `min-height: 72px` — still well above the floor | **pass** |
| Icon sizing (`setIcon(copy, 'copy')`, `setIcon(refresh, 'refresh-cw')` in `card.ts`) | native Obsidian icon sizing via `setIcon()`, no bespoke SVG dimensions in CSS | same | **pass** — matches kit: "Cosmos defines no separate icon-size scale… icons follow Obsidian's native icon-size tokens." |
| Micro-label / eyebrow text | n/a — no section-eyebrow surface exists (see domain note) | n/a | **waived, no such surface** |
| Content typography (`.glance-card__title` 16px/650 weight, `__description` 14px, `__footer` 12px, and their phone media-query overrides) | hardcoded px, not `--font-ui-*` | hardcoded px, phone override to 14/12/11px | **waived, out of scope** — this is rendered *content* typography (the fetched page's title/description/site name), not UI chrome type. `2026-07-24-suite-coherence-design.md` explicitly excludes "niente tipografia di contenuto (NC-Tight = cantiere 3, decisione di Mario)" — a separate, not-yet-started workstream. The kit's §2 governs UI micro-labels/icons/touch-targets, not card body copy. |

## §3 Motion

| Token/animation | Before | After | Verdict |
|---|---|---|---|
| `.glance-card` hover wash (`transition: background-color 120ms ease`) | raw `120ms ease` | `transition: background-color var(--cosmos-t-fast, 140ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))` | **fixed** — this is exactly the kit's "colour/background wash easing" (`--mv-wash`), duration on the `--cosmos-t-fast` micro-feedback tier. `background-color` is a non-composited property but is the suite-wide convention for hover washes (same call made for Sonar's `--sonar-ease`, waived there under the same reasoning — a wash transition, not an entrance animation). |
| `.glance-card__refresh`/`.glance-card__copy` reveal (`transition: opacity 120ms ease`) | raw `120ms ease` | `transition: opacity var(--cosmos-t-fast, 140ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))` | **fixed** — `opacity` reveal-on-hover is exactly the kit's "physical hover/reveal easing" (`--mv-lift`) use case, and `opacity` is a composited property so this one is a clean win for the "animate only transform/opacity" rule too. |
| `glance-spin` (refresh-button spinner, `animation: glance-spin 700ms linear infinite`) | raw `700ms linear infinite` | `animation: glance-spin var(--cosmos-t-spin, 700ms) linear infinite` | **fixed** — a continuous, infinite-loop loading indicator (spinning icon while a fetch is in flight) has no home in the kit's four `--cosmos-t-*` tiers (fast/base/slow/panel — all finite, one-shot durations for discrete state changes, none modeling a rotation period). Rather than leave the literal bare or invent a plugin-local escape hatch, it is consumed as `--cosmos-t-spin` — a forward token proposal in the **suite's own namespace** (`--cosmos-t-*`, not `--glance-*`), same idiom as every other consumed token in this file: `var(--token, <Glance's existing literal>)`. Today Cosmos doesn't define `--cosmos-t-spin`, so this always resolves to the `700ms` fallback and nothing visually changes; it becomes live automatically if/when the kit author adds the token centrally. Flagging this token gap back to the kit author (rather than silently routing around it) is the correct move per the kit's own audit procedure — this note **is** that flag. Respects `prefers-reduced-motion` via the existing block (animation dropped entirely, not slowed). |
| `glance-shimmer` (skeleton shimmer, `animation: glance-shimmer 1.4s ease-in-out infinite`) | raw `1.4s ease-in-out infinite` | `animation: glance-shimmer var(--cosmos-t-shimmer, 1.4s) ease-in-out infinite` | **fixed** — same reasoning and same forward-proposal pattern as `glance-spin`, via `--cosmos-t-shimmer`. Respects `prefers-reduced-motion`. |
| `prefers-reduced-motion: reduce` handling | `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }` on `.glance-card`, `.glance-card__refresh`, `.glance-card__skeleton-media`, `.glance-card__skeleton-line` | unchanged | **pass** — already a correct, complete block; covers all four now-tokenized motion declarations (the two hover/reveal transitions and the two `glance-spin`/`glance-shimmer` animations). Token-zeroing at the Cosmos layer would achieve the same automatically once `--cosmos-t-spin`/`--cosmos-t-shimmer` are formalized centrally, but the explicit override remains required regardless — `infinite` animations don't derive their zeroing from a single root-level token the way a one-shot transition would. |
| Animated properties elsewhere (`.glance-card__copy.is-copied` colour swap — no transition, instant class-toggle repaint) | n/a, no transition declared | n/a | **pass** — no motion to audit; the colour swap on copy-success is an instant state change, not an animated one. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| "No preview available" / error whisper-message | **does not exist** — grepped the full `src/` tree; the degraded state (`.is-degraded`) still renders a full card with a domain-fallback title via `renderMetadata()`, never a bespoke empty-message string | same | **waived, n.a. — no such surface** — Glance has no code path that renders a standalone empty/error message; a failed or partial fetch degrades to a smaller card, not a whisper-text placeholder. Nothing to fix. |
| Section eyebrow / micro-label (e.g. "RESULTS", "RECENT") | **does not exist** — Glance has no grouped list or section headings; each card is an independent inline widget | same | **waived, n.a. — no such surface** |
| Loading state (`.is-loading` skeleton) | shimmer placeholder blocks, no text at all (only an `aria-label` for screen readers: `Loading preview for ${domain}`) | same, resized via the phone media query | **pass** — a skeleton loader is itself the kit-compatible way to represent "loading" (no premature/misleading text), and the one text surface (`aria-label`) is screen-reader-only, not a visible whisper-message subject to the `--text-faint`/`--font-ui-smaller` recipe. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Sentence-case labels | Settings tab uses Obsidian's native `Setting`/`PluginSettingTab` API (`new Setting(containerEl).setName('Show descriptions')…`), not the `.mva-pv` custom-form convention | n/a | **pass, correctly out of scope** — same call as Sonar wave 1: `.mva-pv`/`.mva-sel`/`.mva-btn` governs *custom* plugin forms; Glance's settings tab delegates entirely to Obsidian's built-in `Setting` component, already sentence-case (`Show descriptions`, `Show thumbnails`, `Cache lifetime`, `Clear metadata cache`). No bespoke form to normalize. |
| No native `<select>` | none found (`grep -rn "createEl('select'" src/`: zero hits — the settings tab uses `.addToggle()`/`.addSlider()`/`.addButton()`, all native `Setting` builders) | same | **pass** |
| No `mod-cta` on buttons | none found (`grep -rn "mod-cta" src/`: zero hits) | same | **pass** |
| English product copy, PM jargon untranslated | all UI strings (`card.ts` aria-labels: "Copy link", "Refresh link preview", "Loading preview for…"; `settings.ts`: "Show descriptions", "Cache lifetime", …) are English | same | **pass** |
| Chip+popover pickers, never native `<select>` | n/a — Glance has no picker UI at all (only toggles/slider/button in settings, and the card's two icon-buttons) | n/a | **waived, n.a. — no such surface** |

## Golden rule — raw-value leakage (repo-wide grep, post-fix)

Post-fix `styles.css` grep for raw `ms`/hex/`cubic-bezier` outside a
`var(--token, fallback)` expression: **zero hits**. All four
motion-duration declarations in the file (the two hover/reveal transitions
tokenized under §3 above, plus `glance-spin`/`glance-shimmer`) now carry
their raw literal exclusively as a `var()` fallback — the spin/shimmer
durations route through the forward-proposed `--cosmos-t-spin` /
`--cosmos-t-shimmer` tokens documented above, not through a test-side
allowlist. No raw `ms`/hex/`cubic-bezier` value in this file sits outside a
`var()` expression; the style-contract test enforces this with no
exceptions.

## `!important` audit

`grep -c '!important' styles.css`: **0**, both before and after this wave.
Glance never needed a specificity override against Obsidian core or a
sibling theme — its selectors (`.glance-card`, `.glance-card__*`) are all
plugin-owned classes with no competing native/theme rule at equal or higher
specificity. The style-contract ceiling for this repo is therefore set to
**0** — the strongest possible contract: any future `!important` added to
`styles.css` fails the test immediately, full stop, no ratchet-down grace
period needed since there was never anything to grace.

## Not touched (explicit non-goals, confirmed out of scope)

- No layout or DOM changes anywhere — every fix in this wave is a token
  substitution on an existing declaration (radius, transition duration/
  easing, touch-target padding), never a new/removed/reordered element.
- No content-typography changes (`.glance-card__title`/`__description`/
  `__footer` px sizes) — NC-Tight is a separate, not-yet-started workstream
  (cantiere 3) per `2026-07-24-suite-coherence-design.md`.
- No icon-language changes — Glance already uses native Lucide icon names
  via `setIcon()`; the Huge Icons override (when it lands) is Portal's
  `core-icons.ts` module intercepting `addIcon()` app-wide, not something
  each plugin's own stylesheet or `setIcon()` call sites need to change.
- Settings tab untouched — it already delegates fully to Obsidian's native
  `Setting` API and has zero mv-kit violations.

---

## §6 — wave 2026-07 dinamica

Audit of `styles.css` (265 lines pre-fix) against
`obsidian-cosmos-theme/docs/mv-kit.md` §6 "Elevation & motion depth" (commit
`10f5ddc`, cantiere 2), both desktop and phone columns. Scope: the four §6
sub-rules only (elevation hierarchy, hover richness, drag polish, panel/tab
transitions) — coherence-only, no layout redesign, no new components, per
the same non-goals as wave 6. Model commits consulted: obsidian-portal
(`389d564`/`133c93d`/`4b95bf2`) and obsidian-tabx (`cc65cd4`/`a792752`/
`662d11a`), both already through this same §6 wave.

Glance's only interactive surfaces are the link-preview card itself
(`.glance-card`, inline document content, not a floating/dismissible
overlay) and its two absolutely-positioned icon buttons
(`.glance-card__refresh`/`.glance-card__copy`, revealed on card hover). No
popover, menu, modal, tooltip, or dropdown of any kind exists anywhere in
`src/` (confirmed via `grep -n "Menu(\|Modal(\|popover\|tooltip" src/*.ts`:
zero hits) — this wave's real findings are entirely in the Hover richness
area.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't literally apply, with reason) / **N/A** (no
surface of this type exists).

### Elevation hierarchy

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.glance-card__refresh` / `.glance-card__copy` `box-shadow` (in-card icon buttons) | `var(--shadow-s, 0 1px 2px rgb(0 0 0 / 12%))` — a native Obsidian elevation token, already theme-independent (see wave 6 §1) | same, buttons pinned visible via the phone media query | **pass, waived** — these are small icon buttons sitting inside an inline card, not a floating (Pop) or persistent (Island) surface in §6's sense: they don't overlay content, don't dismiss on outside-click, and aren't a layout-level sidebar/panel. Re-confirmed this wave under §6's more detailed tier language; the wave-6 §1 verdict on this same declaration already reached the same conclusion. |
| Pop-tier surface (menu, popover, tooltip, prompt, dropdown) | **N/A, nessuna superficie di questo tipo** — confirmed via grep, zero `Menu(`/`Modal(`/popover/tooltip construction anywhere in `src/` | same | **N/A** |
| Island-tier surface (persistent sidebar/panel) | **N/A, nessuna superficie di questo tipo** — Glance renders no sidebar/panel view, only inline editor/reading-mode cards | same | **N/A** |
| Glass-tier surface (command bar, floating toolbar over content) | **N/A, nessuna superficie di questo tipo** | same | **N/A** |
| Two tiers stacked on one element | not present — `grep -n "blur\|glass" styles.css`: zero hits; only one `box-shadow` declaration in the whole file | same | **pass, not applicable** — nothing to stack against. |

### Hover richness

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Hover gated to `@media (hover: hover)` on phone-reachable elements | **was a violation**: `.glance-card:hover` (line 37) and `.glance-card:hover .glance-card__refresh, .glance-card:hover .glance-card__copy` (lines 154-155) were bare `:hover` rules, ungated | **was a violation**: the card is inline document content, directly tappable on phone (no dismiss/pointer-leave semantics on touch) — a bare `:hover` would leave the background wash and the button reveal "stuck" on until an unrelated tap elsewhere | **fixed** — both wrapped in `@media (hover: hover)`. `:focus-visible` on the icon buttons was left untouched and ungated (keyboard-only, must never be hover-gated — matches the obsidian-portal precedent for the identical shape of rule). No functional regression on phone: the buttons already have an independent always-visible fallback (`opacity: 1` in the existing `@media (max-width: 600px)` block, lines 236-239 pre-fix) that does not depend on `:hover` at all, so gating the hover-triggered reveal removes zero phone functionality — unlike Portal's `.portal-collection-open`, no new phone fallback was needed here because one already existed. |
| Colour **and** lift, never colour alone | `.glance-card:hover` was a colour-only wash (`background-color`), no `transform` | hover unreachable on touch (correctly gated) | **fixed** — added `transform: translateY(-1px)` to `.glance-card:hover`, eased with `--mv-lift` on the base rule's `transition`, alongside the existing `--mv-wash`-eased colour wash. **Correction to this wave's initial pass** (caught in review, see the "Corrections" subsection below): the first pass of this audit waived the lift, arguing `.glance-card` was closer to the kit's *row* example (`.row:hover`, colour-only) than its *card* example (`.card:hover`, colour+lift) because it's inline document-flow content. That distinction doesn't survive contact with the kit text or the TabX precedent: the kit draws the row/card line on surface styling, not document position, and `.glance-card` is styled exactly like a card (`-card` class name, `border-radius`, `min-height: 84px`, media/title/description/footer layout) — the same shape as `.tabx-card`, which got the identical lift in the model commit (`cc65cd4`) for the identical reason ("had colour/shadow richness but no transform"). Sonar's `.sonar-result` and TabX's own `.tabx-tab` are genuinely plain text rows with no card chrome — not a valid analogy for `.glance-card`. |
| `--mv-wash` for colour/opacity transitions, `--mv-lift` for transform transitions (not interchangeable) | **was a violation**: `.glance-card__refresh`/`.glance-card__copy`'s `opacity` reveal transition (line 143 pre-fix) was wired to `--mv-lift` (the physical-transform easing) | same fix applies (opacity reveal is device-agnostic) | **fixed** — repointed to `--mv-wash` (`var(--cosmos-t-fast, 140ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))`). An `opacity` reveal-on-hover is a colour/opacity wash in the kit's own §6 vocabulary, not a physical transform lift — confirmed against obsidian-portal's own explicit precedent for the identical pattern: `.portal-section-action`'s opacity reveal was repointed from the shared `--portal-motion` (`--mv-lift`) alias to a new `--portal-wash-motion` (`--mv-wash`) alias in commit `389d564`, with the commit message stating the rule in exactly these terms ("colour/opacity washes ease with --mv-wash… physical transforms ease with --mv-lift"). `.glance-card`'s own background-colour hover wash (line 27, base rule) was already correctly on `--mv-wash` pre-wave — only the button's opacity reveal was mismatched. Guarded by a new style-contract test. |
| `transform` lift never exceeds 2px | n/a — no lift-transform hover exists anywhere in the file (`grep -n transform styles.css`: only the spinner's `rotate(360deg)`, a continuous loading animation, not a hover lift) | same | **pass, not applicable** |

### Drag polish

**N/A, nessuna superficie di questo tipo** — Glance implements no
drag-and-drop of any kind. `grep -n "draggable\|dragstart\|dragover\|drop\b"
src/*.ts`: zero hits. The cards are static inline content; nothing moves via
pointer drag.

### Panel & tab transitions

**N/A, nessuna superficie di questo tipo** — Glance has no persistent
panel/sidebar to open/close and no tab-content-swap surface. The only
"transitions" in the file are the hover wash/reveal (Hover richness above)
and the two continuous loading animations (`glance-spin`, `glance-shimmer`,
already audited under wave 6 §3, unchanged this wave).

### Not touched (explicit non-goals, confirmed out of scope)

- No layout or DOM changes anywhere — every fix in this wave is a `@media
  (hover: hover)` wrapper addition around two already-shipped hover rules,
  or a single token repoint (`--mv-lift` → `--mv-wash` on one `transition`
  declaration).
- No new phone-only fallback was needed for the icon-button reveal (unlike
  Portal's `.portal-collection-open` case) — the existing `@media
  (max-width: 600px)` always-visible `opacity: 1` rule already covers
  touch reachability independently of `:hover`.
- Content typography, icon-language, settings tab — unchanged, out of scope
  per wave 6's own non-goals (unaffected by §6).

### Style contract — new §6 assertions

Three new assertions added to `src/style-contract.test.ts`, all mechanically
derived from the concrete findings above (zero speculative assertions):

1. **`§6: every bare :hover rule is gated inside @media (hover: hover)`** —
   a brace-depth scanner walks `styles.css` (comments stripped) tracking
   `@media` nesting, and flags any `:hover` selector line that opens outside
   an enclosing `@media (hover: hover)` block.
2. **`§6: opacity/colour reveal transitions ease with --mv-wash, never
   --mv-lift`** — scans for any `transition: opacity …` declaration that
   references `--mv-lift` and flags it.
3. **`§6: .glance-card hover has both a colour wash and a --mv-lift
   transform lift`** (added in the correction pass below) — asserts
   `.glance-card:hover` inside the `@media (hover: hover)` gate declares a
   `translateY` transform between 0 and 2px, and that the base `.glance-card`
   rule's `transition` carries a `transform` term eased with `--mv-lift`.

**Red-before-green, verified**: all three assertions were written and run
against the pre-fix file first — all failed as expected (assertion 1
flagged all three offending `:hover` selector lines by line number;
assertion 2 flagged the one mismatched `transition: opacity` declaration by
line number and full text; assertion 3 — added in the correction pass —
failed with "expected a translateY transform lift on .glance-card:hover"
against the then-current, lift-less rule). Each fix was then applied and the
suite re-run: all three new assertions pass, all 15 original pre-existing
assertions stayed green throughout (18/18 total after the correction pass).

### Corrections (post-initial-pass review)

A review of this wave's first pass flagged that the "Colour and lift, never
colour alone" row above had waived `.glance-card`'s lift on a "document-flow
row, not a card" distinction that the kit text doesn't draw and that
contradicts the TabX model commit (`cc65cd4`) this same wave was told to
check itself against — `.tabx-card` is styled the same way `.glance-card`
is (bordered/rounded card with media/title/footer) and got the lift for
exactly that reason. Re-read against the kit's own `.row:hover`/`.card:hover`
example and the TabX precedent, `.glance-card` is unambiguously the *card*
case: `-card` class name, `border-radius: var(--mv-r-card, 10px)`,
`min-height: 84px`, structured media/title/description/footer layout — not
a plain text row like `.sonar-result` or `.tabx-tab`. The waiver was wrong
and has been corrected: `transform: translateY(-1px)` was added to
`.glance-card:hover` (inside the existing `@media (hover: hover)` gate),
eased with `--mv-lift` on the base rule's `transition`, matching the wash
already eased with `--mv-wash`. Guarded by new style-contract assertion 3
above, red-green verified. The existing `@media (prefers-reduced-motion:
reduce)` block already lists `.glance-card` with `transition: none`, so the
new transform transition is zeroed there with no further change needed.
The per-rule table row, the "Not touched" bullet that previously named this
as an explicit non-goal, and this section have all been updated/added to
reflect the corrected, landed state — no prior audit content was deleted,
only the one factually-superseded waiver line and its related non-goal
bullet were brought in line with what actually shipped.

### Verification

- `pnpm test` (`node --experimental-strip-types --test src/*.test.ts`) —
  **tests 18 / pass 18 / fail 0** (15 pre-existing + 2 original §6
  assertions + 1 added in the correction pass).
- `pnpm lint` / `pnpm build` / full `pnpm release:check` — see the top-level
  Verification note for this wave's real numbers (run once, covering both
  this §6 pass and confirming no regression to the wave-6 fixes above it).
- Desktop/phone reasoning: CSS-level only, per the hard constraint that
  Obsidian's `EmulateMobile` is never enabled for verification (kills
  Node-based plugins in this suite). The phone-reachability claims above
  (the card is directly tappable; the icon-button fallback is independent
  of `:hover`; the lift transition is zeroed under reduced-motion) are
  verified by reading `@media (max-width: 600px)` /
  `@media (prefers-reduced-motion: reduce)` and the card's DOM/CSS directly,
  not by rendering on-device. Phone sign-off remains Mario's, on-device.

---

## §7 — wave 2026-07 lettura

Audit of `styles.css` and everything under `src/` against
`obsidian-cosmos-theme/docs/mv-kit.md` §7 "Reading rhythm" (commit
`1898860`, cantiere 3 — "Scrittura & lettura"), both desktop and phone
columns. §7 is descriptive-first per the kit's own text: it locks in
*coherence and tokenization*, it does not impose new taste values. Scope:
tokenization audit only — no redesign, no size changes, no visual delta.
Per-surface verdicts below use the kit's own vocabulary: **tokenized** /
**deliberate-deviation-with-reason** / **chrome-out-of-scope**.

Glance has exactly three surfaces with any typography at all —
`.glance-card__title`, `.glance-card__description`, `.glance-card__footer`
— all three already flagged as content typography under wave 6 §2
("content-typography changes… NC-Tight is a separate, not-yet-started
workstream (cantiere 3)"). §7 is that workstream's first real pass: instead
of leaving them unexamined, this wave evaluates each one explicitly against
the reading-rhythm table and records a reasoned verdict, per the kit's own
instruction ("any deliberate deviation… is recorded in the plugin's audit
note with its reason — an undocumented one-off line-height is drift, the
same value with a stated reason is a decision").

### `--file-line-width` / heading-scale verification

Grepped `styles.css` and all of `src/*.ts` for `line-width`, `h1`-`h6`,
`heading`, `font-text-size`, `p-spacing`, and `line-height-normal`:

- `styles.css`: **zero hits** for any of the above.
- `src/*.ts`: **one** incidental hit — `settings.ts:13`,
  `containerEl.createEl('h2', { text: 'Glance' })`, Obsidian's own native
  settings-tab section heading, created via the standard `Setting`-API
  idiom every plugin uses for its settings-tab title. It does not touch
  `--file-line-width`, does not touch the editor heading scale
  (`1.618/1.462/1.318em`), and does not appear inside any note-rendering
  path — it is the settings panel's own `<h2>`, entirely unrelated to the
  reading measure §7 governs.

**Verdict: confirmed clean.** Glance never sets or overrides
`--file-line-width` and never touches the heading scale, on desktop or
phone. The card renders inside whatever reading measure the theme/user has
set for the note, unmodified.

### Per-surface verdicts

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.glance-card__description` | `font-size: 14px`, `line-height: 1.35`, `-webkit-line-clamp: 2` | `font-size: 12px` (same `line-height`/clamp, no override) | **deliberate-deviation-with-reason** — see below |
| `.glance-card__title` | `font-size: 16px`, `line-height: 1.3`, `-webkit-line-clamp: 2` | `font-size: 14px` | **chrome-out-of-scope** — per the brief's own framing, this is chrome (the card's title bar), not prose; §7 governs prose surfaces, and a clamped 1–2 word-wrapped headline has no paragraph rhythm to keep coherent with `--line-height-normal`/`--p-spacing` in the first place |
| `.glance-card__footer` | `font-size: 12px`, `line-height: 1.25` | `font-size: 11px` | **chrome-out-of-scope** — metadata row (favicon + site name), single-line, no paragraph rhythm; same reasoning as title |

**`.glance-card__description` reasoning (the judgment call the brief asked
for).** The kit's §7 MUST applies to "a plugin that renders **prose** (note
preview, chat message, card excerpt, search snippet)" — card excerpt is
named explicitly, so this surface is not automatically out of scope the way
title/footer are. The verdict is nonetheless
**deliberate-deviation-with-reason**, not **tokenized**, for three
compounding reasons:

1. **The clamp makes it non-prose in effect.** `-webkit-line-clamp: 2`
   hard-caps the surface at exactly two lines inside a fixed card geometry
   (`min-height: 84px` desktop / `72px` phone, shared with the title and
   footer rows in the same flex column). §7's reading tokens
   (`--line-height-normal` 1.6/1.55, `--p-spacing` 1rem) model *continuous
   flowing prose the reader scrolls through* — a paragraph that keeps going.
   A 2-line clamped excerpt is structurally a **preview snippet** (the same
   category as a search-result snippet), not a paragraph; there is no
   "rhythm" to keep coherent past the second line because a third line
   never renders.
2. **Swapping the token would change the visual (forbidden by this
   pass's own mandate).** `--font-text-size` is 16px desktop / 18px phone
   (vs. the current 14px/12px) and `--line-height-normal` is 1.6/1.55 (vs.
   the current 1.35). Applying either would grow the two clamped lines
   enough to require either a taller card (`min-height`) or fewer
   characters fitting per line — a layout/visual change, explicitly
   forbidden by this brief ("no redesign, no size changes, no visual
   delta"). Tokenizing this surface is therefore not a no-op substitution
   the way the wave-6 radius/motion fixes were; it cannot be done "minimal".
3. **Precedent inside this same file.** The title (16px) and footer (12px)
   rows sit in the identical fixed-height card chrome, already ruled
   chrome-out-of-scope above and in wave 6 §2. The description differs only
   in being *quoted excerpt text* rather than a title string — but it is
   laid out, clamped, and sized exactly like its chrome siblings, not like
   the note body the reader is editing. Treating it differently from its
   two neighbors inside the same card would be the actual coherence
   violation.

Net: `.glance-card__description` keeps its current literals (`14px`/`1.35`
desktop, `12px` phone) as a **documented decision**, not silent drift. If
Mario later wants the card's excerpt line to visually track the vault's
reading rhythm (e.g. on a future NC-Tight pass that also revisits the
clamp/card-height budget), that is a taste call for him, not something this
coherence-only pass should force through a token swap that changes what the
card looks like.

`font-family: var(--font-interface)` on all three surfaces (title,
description, footer) was already correct pre-wave and stays correct here:
`--font-interface` is the right family for this content — none of the
three should switch to `--font-text` (the prose font), which would be a
genuine §7 violation in the other direction (chrome/excerpt content
borrowing the reading font). No change needed.

### STEP 2 fixes landed this wave

**None.** No genuine §7 prose-token hardcode exists in `styles.css` or
`src/*.ts` to fix:

- The three typography surfaces above are either chrome-out-of-scope
  (title, footer) or a reasoned deliberate deviation (description) — none
  is a case of "prose silently hardcoding its own rhythm" that a `var(...,
  literal)` substitution would coherently fix without a visual delta.
  the `--file-line-width` and heading-scale — the two hard MUST NOTs — are
  both confirmed untouched (see verification above), so there is nothing to
  revert either.
- Per this brief's own instruction, `src/style-contract.test.ts` is **not**
  extended this wave: extending it would mean asserting on a fix that
  doesn't exist, which is exactly the speculative-assertion case the brief
  rules out ("If STEP 2 yields zero genuine fixes, do NOT extend the test
  file"). The `tdd` skill's own red-before-green discipline agrees: there
  is no behavior change to drive a test from.

### Proposte per Mario (non applicate)

Taste/visual-improvement ideas surfaced during this audit — **not applied**,
listed here only for Mario's future call:

1. **`.glance-card__title` (16px/14px), `.glance-card__description`
   (14px/12px), `.glance-card__footer` (12px/11px) are all hand-picked
   px values**, not drawn from the `--font-ui-*` scale or any suite-wide
   card-content scale. They read as internally consistent (title > body >
   footer, consistent step-down on phone) but are three independent literal
   choices rather than a named scale. If/when the NC-Tight cantiere 3
   workstream formally kicks off, these three are the natural first
   candidates for a shared `--glance-card-title-size` /
   `--glance-card-body-size` / `--glance-card-meta-size` token trio (plugin
   -local tokens, not `--mv-*`/`--cosmos-*` — the kit's golden rule reserves
   the suite namespace for suite-wide concerns, and per-plugin card-content
   scales aren't one).
2. **`.glance-card__description`'s 2-line clamp height budget** could be
   revisited alongside the `--font-text-size`/`--line-height-normal`
   question raised above — e.g. growing `min-height` slightly to let the
   excerpt sit at the vault's actual reading line-height without changing
   how many characters fit. This is a genuine visual/layout change (bigger
   card), so it's a redesign call for Mario, not a coherence fix.
3. **Line-height micro-steps (1.3 / 1.35 / 1.25) across title / description
   / footer** are each individually reasonable for a clamped, chrome-styled
   line, but as a trio they are three different hand-tuned values with no
   documented relationship to each other or to the 1.55/1.6 split the kit
   already blesses as intentional elsewhere. Not a violation — the kit's
   own reading-rhythm table only governs true prose surfaces — but a
   candidate for Mario to eyeball if the NC-Tight pass above ever happens,
   since three near-but-not-quite-equal values read as three separate
   taste decisions rather than one.

### Verification

- Grep-only static check (no `EmulateMobile`, per the hard constraint):
  `--file-line-width` / heading-scale confirmed absent from both
  `styles.css` and `src/*.ts` (see above).
- No CSS or TypeScript file was modified this wave — see the top-level
  Verification note for this wave's `pnpm release:check` numbers, run once
  to confirm the zero-change state stays green.
- `git status -sb` after this wave's commit(s): docs-only change (this
  section), no `styles.css`/`src/*.ts` diff, no test-file diff.
