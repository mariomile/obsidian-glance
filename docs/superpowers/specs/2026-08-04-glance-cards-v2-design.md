# Glance cards v2 — design

Date: 2026-08-04
Status: approved, ready for planning

## Goal

Seven changes to Glance, grouped into one coherent shape: cards gain a size
variant, work inside bullet lists and task items, and become directly editable
from the card surface. One pre-existing rendering bug is fixed on the way.

| # | Item | Where it lands |
|---|---|---|
| 1 | Edit-link button | action pill + inline edit |
| 2 | `%%glance:compact%%` marker | parser + layout resolution |
| 3 | Cards in bullet lists without losing the bullet | marker slot |
| 4 | Cards in task items, checkbox redrawn by the card | marker slot |
| 5 | Compact keeps the image, narrower | compact layout |
| 6 | Size toggle button, available inside lists | action pill |
| 7 | Wrapper CSS class wiped on every render | DOM restructure |

## Decisions

**Layout resolution — global default plus symmetric per-line overrides.**
A `Default card size` setting (`expanded` | `compact`, default `expanded`)
applies everywhere. `%%glance:compact%%` and `%%glance:expand%%` are explicit
per-line overrides, valid in every context. No implicit context-dependent
defaults to memorise.

**Edit is inline, not a modal.** Clicking edit reveals a text input inside the
card body holding the current URL. `Enter` saves, `Esc` cancels, blur cancels.
A Markdown link's display text is preserved — only the URL is edited.

**Writes are Live Preview only.** In Reading mode cards keep copy and refresh
but not edit, size toggle, or checkbox — Obsidian's own native task checkbox
stays in place there and keeps working. One write path (`EditorState`), never
`vault.process` from a render pass.

**All mutation lives outside `editor.ts`.** `editor-safety.test.ts` asserts
`editor.ts` contains no `changes:` — the guard behind README's "source-pure"
promise. That invariant is kept, not relaxed: the decoration pipeline stays
pure and every document mutation is confined to `line-write.ts`.

## Line grammar

```
line       := indent prefix link (ws+ layoutMarker)? ws*
indent     := [ \t]*
prefix     := ε
            | listMarker ws+
            | listMarker ws+ '[' (' ' | 'x' | 'X') ']' ws+
listMarker := '-' | '*' | '+' | \d{1,9} ('.' | ')')
link       := url
            | '[' label ']' '(' url (ws+ quoted)? ')'
layoutMarker := '%%glance:compact%%' | '%%glance:expand%%'
```

Parsed into a single structure, replacing today's `{url, label}`:

```ts
export type CardLayout = 'expanded' | 'compact';
export type ListKind = 'none' | 'bullet' | 'ordered' | 'task';

export interface GlanceLine {
  url: string;
  label?: string;
  indent: string;          // verbatim whitespace, preserved on write
  list: ListKind;
  listMarker?: string;     // '-' '*' '+' '3.' '3)' — verbatim
  checked?: boolean;       // task only
  layout?: CardLayout;     // explicit marker only; undefined = follow setting
}
```

`link-source.ts` exports `parseGlanceLine(text): GlanceLine | null` and
`serializeGlanceLine(line): string`. Every document write goes through the
serializer — no ad-hoc string surgery anywhere else.

Resolved layout is `line.layout ?? settings.defaultCardLayout`.

## DOM structure

The card stops owning the element it is handed. This is the structural fix for
item 7: `card.ts` currently assigns `container.className = 'glance-card…'` on
every render, wiping the `glance-editor-card` / `glance-reading-card` class the
wrapper was created with.

```
before                              after
─────────────────────────────       ─────────────────────────────
<div class="glance-editor-card">    <div class="glance-editor-card">
   card.ts overwrites its             <div class="glance-card">
   className on every render            …
                                      </div>
                                    </div>
```

The wrapper owns layout, margins and indentation; the card owns the surface.
Assignment to `className` on a caller-provided element disappears from the
codebase.

This also removes the `.markdown-source-view.mod-cm6 .cm-content > .glance-card
{ display: flex }` override (`styles.css:32-37`). It exists only because
Obsidian core forces `display: block` on direct children of `.cm-content`; the
card is no longer a direct child, so the flex row survives on its own.

Full node order inside `.glance-card`, appended in visual order:

```
.glance-card__marker      (only when list !== 'none')
.glance-card__body        (title, description, footer)
.glance-card__media       (image)
.glance-card__actions     (the pill)
.glance-card__link        (full-surface anchor overlay)
```

Appending media after body in DOM order retires the `order: 2` /
`order` juggling in `styles.css:59-68`.

Indentation reaches CSS as a custom property on the wrapper
(`--glance-indent`), applied as `padding-left`. Its value is a nesting level,
computed from the captured `indent` as `tabCount + floor(spaceCount / 2)` —
a deliberate heuristic matching Obsidian's two-space minimum for list nesting,
so both tab-indented and space-indented lists land on the same levels. Nested
list items stay aligned with the surrounding text.

## Layout variants

```
EXPANDED — default
┌───────────────────────────────────────────────────────────┐
│                            [edit][copy][refr][size] ←hover│
│  Sharpen your thinking           ┌───────────────┐        │
│  Obsidian is the private and     │               │        │
│  flexible writing app…           │    150 px     │        │
│  ▫ obsidian.md                   └───────────────┘        │
└───────────────────────────────────────────────────────────┘
  min-height 84px · title 2 lines · description 2 lines

COMPACT — %%glance:compact%%
┌───────────────────────────────────────────────────────────┐
│  Sharpen your thinking                        ┌──────┐    │
│  ▫ obsidian.md                                │ 64px │    │
└───────────────────────────────────────────────────────────┘
  min-height 52px · title 1 line · no description
  the image stays, only narrower: 150px → 64px

BULLET —  - https://obsidian.md
┌───────────────────────────────────────────────────────────┐
│  •   Sharpen your thinking                    ┌──────┐    │
│      ▫ obsidian.md                            │ 64px │    │
└───────────────────────────────────────────────────────────┘

TASK —  - [ ] https://obsidian.md
┌───────────────────────────────────────────────────────────┐
│ [ ]  Sharpen your thinking                    ┌──────┐    │
│      ▫ obsidian.md                            │ 64px │    │
└───────────────────────────────────────────────────────────┘
```

Compact is a class on the card (`is-compact`), not a separate render path: the
description node is omitted and the media width token changes. When a card is
both compact and degraded, compact wins — 52px, not the 56px of
`is-degraded` — so `.is-compact` is ordered after `.is-degraded` in the
stylesheet and wins on source order rather than on specificity.

## Marker slot

CodeMirror requires `block: true` widgets to span whole lines, so the
decoration cannot start after `- [ ] ` to leave the native marker standing. An
inline widget the height of a card corrupts CodeMirror's height map — the same
ground the comment at `editor.ts:174-177` already documents. So the card
redraws the marker itself, for bullets and checkboxes alike.

- `bullet` — a dot drawn in CSS (`currentColor`, `border-radius: 50%`).
- `ordered` — the literal marker text (`3.`), muted.
- `task` — an `<input type="checkbox">` carrying Obsidian's own
  `task-list-item-checkbox` class, so themes (Cosmos included) skin it for
  free. Toggling it rewrites `- [ ]` ⇄ `- [x]` through `line-write.ts`.

The slot is `flex: 0 0 auto`, first in the row, top-aligned with the title.

## Action pill

Today copy and refresh are two independent 28px boxes, each with its own
background and shadow, sitting over the image (`styles.css:143-186`). Four
actions that way would be a 144px checkerboard over the artwork. They become
one shared surface:

```
        ┌─────────────────────────────┐
        │  edit  copy  refr  size     │   one background, one shadow
        └─────────────────────────────┘
```

`.glance-card__actions` owns the background, radius and shadow; the buttons
inside are transparent and keep `clickable-icon` for hover feedback. Revealed
on hover inside the existing `@media (hover: hover)` gate, forced visible on
phone as today.

Icons via `setIcon`: `pencil`, `copy`, `refresh-cw`, and
`chevrons-down-up` / `chevrons-up-down` for the size toggle. `edit` and `size`
render only when the card is editable (Live Preview).

The phone touch-target pseudo-element pattern at `styles.css:276-281` moves to
the buttons inside the pill; the pill itself is laid out so each button clears
`--cosmos-touch-min`.

## Inline edit

```
┌───────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────┐        ┌──────────┐  │
│  │ https://obsidian.md█            │        │          │  │
│  └─────────────────────────────────┘        │  150px   │  │
│  Obsidian is the private and…               │          │  │
│  ▫ obsidian.md                              └──────────┘  │
└───────────────────────────────────────────────────────────┘
```

The input is inserted at the top of the card body; title and footer stay
visible underneath. Focus works because CodeMirror sets
`contentEditable = "false"` on widget wrappers whose `widget.editable` is
falsy (`@codemirror/view` `WidgetView.sync` / `BlockWidgetView.sync`), and form
controls inside a `contenteditable=false` island behave normally.

The real hazard is different: any transaction moving the selection onto that
line hits the `lineHasSelection` bailout at `editor.ts:78`, drops the
decoration, and unmounts the card mid-typing.

Mitigation — `editingLineField`, a `StateField<number | null>` holding the
`from` of the line being edited, driven by `beginInlineEdit` / `endInlineEdit`
effects and mapped through document changes. `lineDecoration` consults it and
skips the selection bailout for that one line. `touchedLineRanges` includes the
editing position from both start and end state so the effect-only transaction
is not swallowed by the `!docChanged && !selectionChanged` early return.

Edit state itself stays DOM-local. `LinkCardWidget.eq()` does not include it,
so `become()` skips `markDirty` and the input node survives transactions.

On save the line is rewritten; the new widget has a different URL, `eq()`
returns false, the card remounts and fetches fresh metadata.

## Write path

The widget does not know its own position, and the position moves. Resolved at
click time:

```
click → view.posAtDOM(wrapper) → state.doc.lineAt(pos) → parseGlanceLine
      → mutate → serializeGlanceLine
      → view.dispatch({ changes: { from: line.from, to: line.to, insert } })
```

`posAtDOM` is the reliable resolver inside embedded blocks (`posAtCoords` does
not resolve there).

`toDOM(view)` accepts the view CodeMirror already passes and today ignores.

`line-write.ts` exports the three mutations as pure line transforms, plus one
binder that is the sole holder of `dispatch`:

```ts
// pure: string in, string out — directly testable without a DOM
export function withLink(line: GlanceLine, url: string): GlanceLine
export function withLayout(line: GlanceLine, layout: CardLayout | undefined): GlanceLine
export function withChecked(line: GlanceLine, checked: boolean): GlanceLine

// the only place a document mutation is dispatched
export function bindWriter(view: EditorView, dom: HTMLElement): CardWriter
```

`withLayout(line, undefined)` removes the marker, returning the line to the
global default.

## Card host contract

`CardHost` keeps its current shape (`store`, `settings`). `mountCard` gains a
second argument carrying everything that varies per mount, rather than more
globals:

```ts
export interface CardContext {
  line: GlanceLine;
  layout: CardLayout;   // already resolved against the setting
  editable: boolean;    // true only in Live Preview
  write?: CardWriter;   // present iff editable
}

export interface CardWriter {
  setLink(url: string): void;
  setLayout(layout: CardLayout | undefined): void;
  setChecked(checked: boolean): void;
}
```

`editor.ts` builds the writer with `bindWriter(view, wrapper)` and passes it
down; the resolution of `posAtDOM` and the `dispatch` both happen inside
`line-write.ts`, which is how `editor.ts` stays free of `changes:`.

Reading mode passes `editable: false` and no writer, which is what removes
edit and size from the pill there without a second branch in the renderer.

`LinkCardWidget.eq()` must compare the resolved layout, list kind, checked
state and indent alongside url/label/settings — otherwise a size toggle would
not repaint.

## Reading mode

Two changes to `reading.ts`:

1. Task items are no longer skipped. `input` comes out of the skip filter at
   `reading.ts:75`, and anchor detection ignores the checkbox node so a task
   `<li>` (checkbox + anchor) still resolves to a single external anchor. The
   native checkbox stays and keeps working.
2. Layout resolution. Obsidian strips `%%…%%` comments from rendered output, so
   the marker is never in the DOM. The source is read via
   `ctx.getSectionInfo(el)`, whose `text` is the whole file with `lineStart` /
   `lineEnd` delimiting the section. Candidate lines in that range are parsed
   once per section and matched to mounted cards in document order, so repeated
   URLs in one section still map to the right line.

## Settings

`defaultCardLayout: CardLayout` added to `GlanceSettings` and
`DEFAULT_SETTINGS` (`expanded`). A dropdown in `GlanceSettingTab`; changing it
calls the existing `refreshEditors()`.

Known limitation, pre-existing and unchanged: `refreshGlanceEffect` reaches
editors only, so Reading-mode views do not repaint on a settings change until
re-rendered. `showDescription` and `showThumbnail` already behave this way.

## Files

| File | Change |
|---|---|
| `link-source.ts` | rewritten — `parseGlanceLine` + `serializeGlanceLine` |
| `line-write.ts` | **new** — the only module that mutates the document |
| `card.ts` | stays the orchestrator; loses button rendering |
| `card-actions.ts` | **new** — pill, four actions, inline edit |
| `card-marker.ts` | **new** — bullet / ordered / checkbox slot |
| `editor.ts` | `editingLineField`, `toDOM(view)`, richer `eq()`; still no `changes:` |
| `reading.ts` | tasks admitted, layout resolved from section source |
| `model.ts` | `CardLayout`, `ListKind`, `GlanceLine`, `defaultCardLayout` |
| `settings.ts` | the `Default card size` dropdown |
| `styles.css` | compact variant, marker slot, pill; drops the `display:flex` override and the `order` juggling |
| `main.ts` | passes the resolved context into both hosts |

`card.ts` stays near its current size instead of growing toward 400 lines.

## Testing

No jsdom in this project — `node --experimental-strip-types --test` with zero
test dependencies. Existing tests are pure logic or source scans, and the new
ones follow the same convention.

- `link-source.test.ts` — table-driven parse across every combination of
  bare/Markdown link × `none`/`bullet`/`ordered`/`task` × checked × indent ×
  marker; plus `serialize(parse(x)) === x` round-trip idempotence, which is
  what guarantees no user's line is silently reformatted on a checkbox click.
- `line-write.test.ts` — `withLink` / `withLayout` / `withChecked` composed
  with the serializer, asserted as string-to-string line transforms, including
  marker removal returning the line to the default.
- `editor-safety.test.ts` — its existing assertions stay exactly as they are,
  and become load-bearing: the `changes:` guard is what keeps the write path
  out of the decoration pipeline. Two assertions are added alongside them —
  that `card.ts` never assigns `className` on a caller-provided element (the
  source-level guard for item 7), and that `line-write.ts` is the only module
  containing `view.dispatch`.
- `style-contract.test.ts` — unchanged; the pill and compact rules must satisfy
  it (no `!important`, no raw ms/hex/cubic-bezier outside a `var()` fallback,
  every `:hover` inside the `hover: hover` gate).

## Landing order

The fix and the parser are the foundation for everything else and land first as
standalone commits, so they survive independently if later work is reverted.

1. Item 7 — DOM restructure, `display:flex` override removed, source guard.
2. Parser — `parseGlanceLine` / `serializeGlanceLine` and their tests, no
   behaviour change yet.
3. Items 2 and 5 — settings, markers, compact variant with the narrower image.
4. Item 3 — marker slot for bullets and ordered items.
5. Item 4 — tasks and the redrawn checkbox, plus `line-write.ts`.
6. Items 1 and 6 — action pill, inline edit, size toggle.
7. Reading-mode delta.
8. README, then version bump and release per the suite release contract.

## Non-goals

- Writing to the document from Reading mode.
- Inline links inside sentences — still deliberately untouched.
- Editing the Markdown display text (only the URL is editable inline).
- Repainting Reading-mode views on a settings change.

## Documentation follow-up

README's "Source-pure" bullet needs a nuance: rendering still never changes the
Markdown, but the card's own controls now do, on explicit user action. The
"Commands" section is unaffected; the new controls are card-surface only.
