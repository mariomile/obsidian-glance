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
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — before this wave, `styles.css` consumed **zero** suite tokens. It now consumes `--mv-r-card` (card radius), `--mv-r1` (icon-button radius), `--cosmos-t-fast`/`--mv-wash` (hover-wash transition), `--cosmos-t-fast` (icon-button opacity transition), and `--cosmos-touch-min` (phone tap targets) — each with a literal fallback equal to Glance's pre-fix value, so a Cosmos-less vault renders byte-identically. |
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
| `glance-spin` (refresh-button spinner, `animation: glance-spin 700ms linear infinite`) | raw `700ms linear infinite` | unchanged | **waived** — a continuous, infinite-loop loading indicator (spinning icon while a fetch is in flight), not a discrete entrance/reveal/confirmation transition. The kit's `--cosmos-t-*` tiers (fast/base/slow/panel) are all *finite* durations for one-shot state changes; none of the kit's five sections defines a token for a continuous spinner's rotation period, and `linear infinite` has no "settle" moment a duration token would meaningfully redirect. Respects `prefers-reduced-motion` via the existing block (animation dropped entirely, not slowed). |
| `glance-shimmer` (skeleton shimmer, `animation: glance-shimmer 1.4s ease-in-out infinite`) | raw `1.4s ease-in-out infinite` | unchanged | **waived** — same reasoning as `glance-spin`: continuous loading-shimmer loop, not a tokenized transition tier. Respects `prefers-reduced-motion`. |
| `prefers-reduced-motion: reduce` handling | `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }` on `.glance-card`, `.glance-card__refresh`, `.glance-card__skeleton-media`, `.glance-card__skeleton-line` | unchanged | **pass** — already a correct, complete block; covers both the two now-tokenized transitions and the two waived infinite animations. Token-zeroing at the Cosmos layer would achieve the same for the transitions once tokens are consumed, but the explicit override is required regardless for the two `infinite` animations, which don't derive from `--cosmos-t-*` at all. |
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
`var(--token, fallback)` expression: **zero hits**. The two fixed
transitions (`120ms ease` → tokenized) are now the only motion-duration
matches, both living inside `var()` fallbacks. The three `infinite`
keyframe animations (`700ms linear infinite`, `1.4s ease-in-out infinite`)
are explicitly waived above (§3) — `1.4s` isn't even matched by the `ms`
raw-value pattern (it's seconds), and `700ms` is judged in-scope-but-waived
by the audit rather than silently exempt, since it's a real raw value that
needed a documented reason rather than a pattern gap.

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
