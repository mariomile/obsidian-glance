# Glance Cards v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Glance cards a compact size variant, make them work inside bullet lists and task items, and let the card edit its own link — while fixing a pre-existing render bug that wipes the wrapper's CSS class.

**Architecture:** A verbatim-slice line model (`prefix` + `linkText` + `suffix`) makes every document write surgical and exactly round-trippable. All mutation is confined to `line-write.ts` so `editor.ts` stays free of `changes:` and the decoration pipeline remains pure. The card renders into its own child element instead of the wrapper it is handed, which is what removes the class-wipe bug structurally.

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/state`, `@codemirror/view`), Obsidian 1.13 API, `node --experimental-strip-types --test` (no jsdom, no test dependencies), esbuild, eslint.

Spec: `docs/superpowers/specs/2026-08-04-glance-cards-v2-design.md`

## Refinement against the spec

The spec models `GlanceLine` as reconstructed fields (`indent`, `listMarker`, `checked`) and serializes by reassembling them. That cannot deliver the exact round-trip the spec promises: a titled Markdown link `[a](url "t")` loses its title, and `-   https://…` loses its spacing — so a checkbox click would silently reformat the user's line.

This plan uses verbatim slices instead: `prefix` + `linkText` + `suffix` captured as written, with `serializeGlanceLine` a plain concatenation. Exact round-trip becomes true by construction rather than by test coverage, and `withChecked` swaps a single character inside `prefix` without touching anything else. Same behaviour as the spec, stronger guarantee.

One addition the spec left implicit: `CardContext.marker` is what the card must draw *itself*, separate from `line.list`. Reading mode always passes `'none'` because Obsidian's native bullet and checkbox stay in place there.

## Global Constraints

- Node `>=22`. Package manager is `pnpm@10.17.1` — never `npm` or `yarn`.
- Tests run under `node --experimental-strip-types --test src/*.test.ts`. No jsdom, no test framework, no new dependencies. Tests are pure logic or source scans.
- All imports of local modules use the `.ts` extension (`./model.ts`), matching the existing codebase.
- `styles.css` must keep passing `src/style-contract.test.ts`: zero `!important`; every raw `ms` / hex / `cubic-bezier` value only ever as a `var(--token, fallback)` fallback; every `:hover` selector inside `@media (hover: hover)`; `.glance-card:hover` keeps both a colour wash and a `translateY` lift between 0 and 2px; `.glance-card` base rule keeps `transform var(--cosmos-t-fast, 140ms) var(--mv-lift,`.
- Never write a CSS comment containing a `--token-*` glob immediately followed by a slash — it closes the comment early and the browser drops the enclosing rule. Guarded by `style-contract.test.ts`.
- `editor.ts` must never contain the string `changes:` — guarded by `editor-safety.test.ts`. All document mutation lives in `line-write.ts`.
- No emoji anywhere in UI, comments, or commit messages. Icons come from `setIcon` (lucide names) only.
- Run `pnpm lint && pnpm test && pnpm typecheck` before every commit.

---

### Task 1: Card renders into its own element

Fixes item 7. `card.ts` currently assigns `container.className = 'glance-card…'` on every render, destroying the `glance-editor-card` / `glance-reading-card` class its caller created the element with.

**Files:**
- Modify: `src/card.ts:12-28` (`createSkeleton`), `src/card.ts:44-51` (`renderMetadata`), `src/card.ts:134-146` (`mountCard`)
- Modify: `src/styles.css` — no; the correct path is `styles.css:1-37`
- Test: `src/editor-safety.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `mountCard(wrapper: HTMLElement, source: LinkSource, host: CardHost): () => void` — unchanged signature, but `wrapper` is now only appended to, never restyled. Later tasks change this signature in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `src/editor-safety.test.ts`:

```ts
const cardSourceUrl = new URL('./card.ts', import.meta.url);

test('card.ts never restyles the wrapper element it is handed', async () => {
  const source = await readFile(cardSourceUrl, 'utf8');

  // The card owns a child element it creates itself; the wrapper belongs to
  // the caller (glance-editor-card / glance-reading-card) and carries the
  // layout classes. Assigning to the wrapper's className wipes them on every
  // render — the bug this guard exists to prevent from returning.
  assert.doesNotMatch(source, /\bwrapper\.className\s*=/);
  assert.doesNotMatch(source, /\bwrapper\.classList\b/);
  assert.match(source, /\bwrapper\.append\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `card.ts` has no `wrapper` identifier at all, so the `assert.match(source, /\bwrapper\.append\(/)` assertion fails.

- [ ] **Step 3: Restructure `mountCard`**

Replace `src/card.ts:134-146` with:

```ts
export function mountCard(wrapper: HTMLElement, source: LinkSource, host: CardHost): () => void {
  // The card is a child element the module owns outright. The wrapper belongs
  // to the caller and carries its own layout class, which is why nothing here
  // ever touches the wrapper's class list.
  const card = document.createElement('div');
  wrapper.append(card);

  const current = host.store.get(source.url);
  if (current) renderMetadata(card, current, host, source);
  else createSkeleton(card, source);

  const unsubscribe = host.store.subscribe(source.url, (metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, source);
  });
  void host.store.ensure(source.url, source.label).then((metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, source);
  });
  return unsubscribe;
}
```

`createSkeleton` and `renderMetadata` keep assigning `container.className` — `container` is now the module-owned card element, which is exactly what should carry `glance-card`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, all files.

- [ ] **Step 5: Drop the now-dead flex override and the doubled margin**

In `styles.css`, delete lines 32-37 entirely (the comment block and the rule):

```css
/* Obsidian core forces `.cm-content > *` to display:block (specificity 0,3,0),
   which flattens the card's flex row in Live Preview. Mirror that selector plus
   the card class (0,4,0) so the flex layout — and thus the media `order` — wins. */
.markdown-source-view.mod-cm6 .cm-content > .glance-card {
  display: flex;
}
```

The card is no longer a direct child of `.cm-content`, so core's `display: block` never reaches it.

Then remove the duplicated vertical margin — the wrapper already owns it (`styles.css:4`). In the `.glance-card` rule, delete this one line:

```css
  margin: 0.35rem 0;
```

- [ ] **Step 6: Verify the stylesheet still satisfies its contract**

Run: `pnpm test`
Expected: PASS — in particular `.glance-card hover has both a colour wash and a --mv-lift transform lift`, which reads the `.glance-card` base rule you just edited.

- [ ] **Step 7: Build and eyeball in the vault**

Run: `pnpm build`
Then reload Obsidian and confirm a standalone link still renders as a card in both Live Preview and Reading mode, with unchanged spacing.

- [ ] **Step 8: Commit**

```bash
git add src/card.ts src/editor-safety.test.ts styles.css
git commit -m "fix(card): render into an owned child instead of restyling the wrapper

createSkeleton/renderMetadata assigned container.className on every render,
wiping the glance-editor-card / glance-reading-card class the caller created
the element with. The card now owns a child element, which also retires the
.cm-content > .glance-card display:flex override — core's display:block no
longer reaches the card — and the margin the wrapper already carried.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Verbatim line model

Replaces `parseStandaloneLink` with a parser that captures the whole line structure and a serializer that reproduces it exactly. No behaviour change yet — this is the foundation Tasks 3-6 build on.

**Files:**
- Modify: `src/model.ts` (add types)
- Modify: `src/link-source.ts` (rewrite the parser)
- Modify: `src/editor.ts:19,77` and `src/main.ts:4,49` (callers)
- Test: `src/link-source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CardLayout = 'expanded' | 'compact'`
  - `type ListKind = 'none' | 'bullet' | 'ordered' | 'task'`
  - `interface GlanceLine extends LinkSource { prefix, linkText, suffix, indentLevel, list, checked?, layout? }`
  - `parseGlanceLine(text: string): GlanceLine | null`
  - `serializeGlanceLine(line: GlanceLine): string`
  - `parseStandaloneLink` is removed; every caller moves to `parseGlanceLine`.

- [ ] **Step 1: Add the types**

Append to `src/model.ts`, after the `LinkSource` interface:

```ts
export type CardLayout = 'expanded' | 'compact';

export type ListKind = 'none' | 'bullet' | 'ordered' | 'task';

/**
 * A parsed link line, stored as verbatim slices rather than reconstructed
 * fields: `prefix + linkText + suffix` is always exactly the original line.
 * Writes mutate one slice and leave the rest byte-identical, so a checkbox
 * click can never reformat spacing or drop a Markdown link title.
 */
export interface GlanceLine extends LinkSource {
  /** Everything before the link: indent, list marker, task box, gaps. */
  prefix: string;
  /** The link exactly as written. */
  linkText: string;
  /** Everything after the link: the layout marker and trailing whitespace. */
  suffix: string;
  /** Nesting level: tab count plus half the space count, floored. */
  indentLevel: number;
  list: ListKind;
  /** Present only when `list === 'task'`. */
  checked?: boolean;
  /** Set only by an explicit marker; otherwise the setting decides. */
  layout?: CardLayout;
}
```

- [ ] **Step 2: Write the failing tests**

Replace the contents of `src/link-source.test.ts` with:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { domainLabel, isSafeWebUrl, parseGlanceLine, serializeGlanceLine } from './link-source.ts';

test('parses a bare url on its own line', () => {
  const line = parseGlanceLine('https://obsidian.md');
  assert.equal(line?.url, 'https://obsidian.md');
  assert.equal(line?.label, undefined);
  assert.equal(line?.list, 'none');
  assert.equal(line?.layout, undefined);
  assert.equal(line?.indentLevel, 0);
});

test('parses a markdown link and keeps its label', () => {
  const line = parseGlanceLine('[Obsidian](https://obsidian.md)');
  assert.equal(line?.url, 'https://obsidian.md');
  assert.equal(line?.label, 'Obsidian');
});

test('classifies list kinds', () => {
  assert.equal(parseGlanceLine('- https://obsidian.md')?.list, 'bullet');
  assert.equal(parseGlanceLine('* https://obsidian.md')?.list, 'bullet');
  assert.equal(parseGlanceLine('+ https://obsidian.md')?.list, 'bullet');
  assert.equal(parseGlanceLine('3. https://obsidian.md')?.list, 'ordered');
  assert.equal(parseGlanceLine('3) https://obsidian.md')?.list, 'ordered');
  assert.equal(parseGlanceLine('- [ ] https://obsidian.md')?.list, 'task');
});

test('reads the task checkbox state', () => {
  assert.equal(parseGlanceLine('- [ ] https://obsidian.md')?.checked, false);
  assert.equal(parseGlanceLine('- [x] https://obsidian.md')?.checked, true);
  assert.equal(parseGlanceLine('- [X] https://obsidian.md')?.checked, true);
  assert.equal(parseGlanceLine('https://obsidian.md')?.checked, undefined);
});

test('reads the layout marker', () => {
  assert.equal(parseGlanceLine('https://obsidian.md %%glance:compact%%')?.layout, 'compact');
  assert.equal(parseGlanceLine('https://obsidian.md %%glance:expand%%')?.layout, 'expanded');
  assert.equal(parseGlanceLine('https://obsidian.md')?.layout, undefined);
});

test('computes the indent level from tabs and space pairs', () => {
  assert.equal(parseGlanceLine('https://obsidian.md')?.indentLevel, 0);
  assert.equal(parseGlanceLine('  - https://obsidian.md')?.indentLevel, 1);
  assert.equal(parseGlanceLine('    - https://obsidian.md')?.indentLevel, 2);
  assert.equal(parseGlanceLine('\t- https://obsidian.md')?.indentLevel, 1);
  assert.equal(parseGlanceLine('\t\t- https://obsidian.md')?.indentLevel, 2);
});

test('rejects lines that are not standalone links', () => {
  assert.equal(parseGlanceLine('see https://obsidian.md for more'), null);
  assert.equal(parseGlanceLine('https://obsidian.md and more'), null);
  assert.equal(parseGlanceLine('plain text'), null);
  assert.equal(parseGlanceLine(''), null);
  assert.equal(parseGlanceLine('javascript:alert(1)'), null);
  assert.equal(parseGlanceLine('[Obsidian](javascript:alert(1))'), null);
});

test('serialize(parse(line)) reproduces the line byte for byte', () => {
  const lines = [
    'https://obsidian.md',
    '[Obsidian](https://obsidian.md)',
    '[Obsidian](https://obsidian.md "The title")',
    '- https://obsidian.md',
    '-   https://obsidian.md',
    '  * [Obsidian](https://obsidian.md)',
    '\t- [ ] https://obsidian.md',
    '- [x] https://obsidian.md %%glance:compact%%',
    '12. https://obsidian.md %%glance:expand%%',
    'https://obsidian.md   ',
  ];

  for (const original of lines) {
    const parsed = parseGlanceLine(original);
    assert.ok(parsed, `expected to parse: ${JSON.stringify(original)}`);
    assert.equal(serializeGlanceLine(parsed), original);
  }
});

test('isSafeWebUrl accepts only http and https', () => {
  assert.equal(isSafeWebUrl('https://obsidian.md'), true);
  assert.equal(isSafeWebUrl('http://obsidian.md'), true);
  assert.equal(isSafeWebUrl('file:///etc/passwd'), false);
  assert.equal(isSafeWebUrl('not a url'), false);
});

test('domainLabel strips the www prefix', () => {
  assert.equal(domainLabel('https://www.obsidian.md/download'), 'obsidian.md');
  assert.equal(domainLabel('nonsense'), 'nonsense');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `parseGlanceLine` and `serializeGlanceLine` are not exported from `link-source.ts`.

- [ ] **Step 4: Rewrite the parser**

Replace `src/link-source.ts:1-22` (the imports and `parseStandaloneLink`) with:

```ts
import type { CardLayout, GlanceLine, LinkSource, ListKind } from './model.ts';

/**
 * Splits a line into three verbatim slices: everything before the link,
 * the link itself, and everything after it. Group 2 is the list marker,
 * group 3 the task checkbox character, group 5 the layout marker keyword.
 *
 * The lazy `(.*?)` for the link grows only until the trailing group can
 * reach the end of the line, so trailing whitespace and the layout marker
 * always land in the suffix rather than in the link text.
 */
const LINE = new RegExp(
  '^(' +
    '[ \\t]*' +
    '(?:([-*+]|\\d{1,9}[.)])[ \\t]+' +
      '(?:\\[([ xX])\\][ \\t]+)?' +
    ')?' +
  ')' +
  '(.*?)' +
  '((?:[ \\t]+%%glance:(compact|expand)%%)?[ \\t]*)$',
  'i',
);

const RAW_URL = /^(https?:\/\/[^\s<>]+)$/i;
const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^\s)]+)(?:[ \t]+["'][^"']*["'])?\)$/i;

function parseLink(text: string): LinkSource | null {
  const markdown = MARKDOWN_LINK.exec(text);
  if (markdown?.[1] && markdown[2] && isSafeWebUrl(markdown[2])) {
    return { url: markdown[2], label: markdown[1] };
  }

  const raw = RAW_URL.exec(text);
  if (raw?.[1] && isSafeWebUrl(raw[1])) return { url: raw[1] };
  return null;
}

function indentLevelOf(prefix: string): number {
  const whitespace = /^[ \t]*/.exec(prefix)?.[0] ?? '';
  let tabs = 0;
  let spaces = 0;
  for (const character of whitespace) {
    if (character === '\t') tabs += 1;
    else spaces += 1;
  }
  // Obsidian nests a list item at two spaces minimum, so a space pair is one
  // level. Tabs are one level each regardless of the editor's tab width.
  return tabs + Math.floor(spaces / 2);
}

function listKindOf(marker: string | undefined, taskBox: string | undefined): ListKind {
  if (!marker) return 'none';
  if (taskBox !== undefined) return 'task';
  return /^\d/.test(marker) ? 'ordered' : 'bullet';
}

export function parseGlanceLine(text: string): GlanceLine | null {
  const match = LINE.exec(text);
  if (!match) return null;

  const [, prefix = '', listMarker, taskBox, linkText = '', suffix = '', layoutWord] = match;
  const source = parseLink(linkText);
  if (!source) return null;

  const list = listKindOf(listMarker, taskBox);
  const layout: CardLayout | undefined = layoutWord
    ? (layoutWord.toLowerCase() === 'compact' ? 'compact' : 'expanded')
    : undefined;

  return {
    ...source,
    prefix,
    linkText,
    suffix,
    indentLevel: indentLevelOf(prefix),
    list,
    ...(list === 'task' ? { checked: taskBox?.toLowerCase() === 'x' } : {}),
    ...(layout ? { layout } : {}),
  };
}

export function serializeGlanceLine(line: GlanceLine): string {
  return `${line.prefix}${line.linkText}${line.suffix}`;
}
```

Keep `isSafeWebUrl`, `domainLabel` and `resolveWebUrl` exactly as they are — they are used by `metadata.ts` and by `parseLink` above.

- [ ] **Step 5: Update the two callers**

In `src/editor.ts`, change the import on line 19 to:

```ts
import { parseGlanceLine } from './link-source.ts';
```

and line 77 inside `lineDecoration` to:

```ts
  const source = parseGlanceLine(text);
```

In `src/main.ts`, change the import on line 4 to:

```ts
import { parseGlanceLine } from './link-source.ts';
```

and line 49 inside the refresh command to:

```ts
        const source = parseGlanceLine(editor.getLine(editor.getCursor().line));
```

Both call sites only read `.url` and `.label`, which `GlanceLine` still carries.

- [ ] **Step 6: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS on all three. `editor.ts` still contains no `changes:`, so `editor-safety.test.ts` stays green.

- [ ] **Step 7: Commit**

```bash
git add src/model.ts src/link-source.ts src/link-source.test.ts src/editor.ts src/main.ts
git commit -m "feat(parser): verbatim line model for links, lists and layout markers

parseGlanceLine captures the line as three verbatim slices — prefix, link
text, suffix — so serializeGlanceLine is a concatenation and the round trip
is exact by construction. A titled Markdown link keeps its title and odd
spacing survives, which is what lets later writes mutate one slice without
reformatting the user's line.

Recognises bullet, ordered and task prefixes, the checkbox state, the
indent level, and the %%glance:compact%% / %%glance:expand%% markers. No
rendering change yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Layout resolution, setting, and the compact variant

Delivers items 2 and 5. Introduces `CardContext`, the `Default card size` setting, and the compact rendering path with the narrower image.

**Files:**
- Modify: `src/model.ts` (`defaultCardLayout` in settings)
- Modify: `src/card.ts` (context argument, compact class, description omission)
- Modify: `src/editor.ts` (build the context, widen `eq()`)
- Modify: `src/reading.ts` (build a minimal context)
- Modify: `src/settings.ts` (the dropdown)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `GlanceLine`, `CardLayout`, `ListKind`, `parseGlanceLine` (Task 2).
- Produces:
  - `interface CardContext { line: GlanceLine; layout: CardLayout; marker: ListKind; editable: boolean; write?: CardWriter }` exported from `src/card.ts`. `write` and `marker` are unused until Tasks 4-6; declare `write?: never` is **not** acceptable — declare it as optional and typed once `CardWriter` exists in Task 5. For this task, omit the `write` field entirely and add it in Task 5.
  - `mountCard(wrapper: HTMLElement, context: CardContext, host: CardHost): () => void`
  - `resolveLayout(line: GlanceLine, settings: GlanceSettings): CardLayout`

- [ ] **Step 1: Add the setting**

In `src/model.ts`, add to `GlanceSettings`:

```ts
  defaultCardLayout: CardLayout;
```

and to `DEFAULT_SETTINGS`:

```ts
  defaultCardLayout: 'expanded',
```

- [ ] **Step 2: Write the failing test**

Create `src/card-context.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLayout } from './card.ts';
import { parseGlanceLine } from './link-source.ts';
import { DEFAULT_SETTINGS, type GlanceSettings } from './model.ts';

function settingsWith(defaultCardLayout: GlanceSettings['defaultCardLayout']): GlanceSettings {
  return { ...DEFAULT_SETTINGS, defaultCardLayout };
}

function lineOf(text: string) {
  const line = parseGlanceLine(text);
  assert.ok(line, `expected to parse: ${text}`);
  return line;
}

test('an unmarked line follows the global default', () => {
  assert.equal(resolveLayout(lineOf('https://obsidian.md'), settingsWith('expanded')), 'expanded');
  assert.equal(resolveLayout(lineOf('https://obsidian.md'), settingsWith('compact')), 'compact');
});

test('a marker overrides the global default in both directions', () => {
  const compactMarked = lineOf('https://obsidian.md %%glance:compact%%');
  const expandMarked = lineOf('https://obsidian.md %%glance:expand%%');

  assert.equal(resolveLayout(compactMarked, settingsWith('expanded')), 'compact');
  assert.equal(resolveLayout(expandMarked, settingsWith('compact')), 'expanded');
});

test('the override applies inside lists and tasks too', () => {
  const task = lineOf('- [ ] https://obsidian.md %%glance:expand%%');
  assert.equal(resolveLayout(task, settingsWith('compact')), 'expanded');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `resolveLayout` is not exported from `card.ts`.

- [ ] **Step 4: Add the context and the resolver to `card.ts`**

Add to the top of `src/card.ts`, after the existing imports:

```ts
import type {
  CardLayout,
  GlanceLine,
  GlanceSettings,
  LinkMetadata,
  ListKind,
} from './model.ts';

/** Everything that varies per mounted card. `marker` is what the card must
 *  draw itself — Reading mode passes 'none' because Obsidian's own bullet
 *  and checkbox stay in place there. */
export interface CardContext {
  line: GlanceLine;
  layout: CardLayout;
  marker: ListKind;
  editable: boolean;
}

export function resolveLayout(line: GlanceLine, settings: GlanceSettings): CardLayout {
  return line.layout ?? settings.defaultCardLayout;
}
```

Merge the type import with the existing one on line 4 rather than duplicating it.

- [ ] **Step 5: Thread the context through the renderers**

Change the three functions in `src/card.ts` to take `context` in place of `source`:

```ts
function createSkeleton(container: HTMLElement, context: CardContext): void {
  container.replaceChildren();
  container.className = `glance-card is-loading${context.layout === 'compact' ? ' is-compact' : ''}`;
  container.setAttribute('aria-label', `Loading preview for ${domainLabel(context.line.url)}`);

  const media = document.createElement('div');
  media.className = 'glance-card__skeleton-media';
  const body = document.createElement('div');
  body.className = 'glance-card__body';
  const widths = context.layout === 'compact' ? ['72%', '46%'] : ['72%', '92%', '46%'];
  for (const width of widths) {
    const line = document.createElement('div');
    line.className = 'glance-card__skeleton-line';
    line.style.width = width;
    body.append(line);
  }
  container.append(body, media);
}
```

In `renderMetadata`, replace the signature and the first lines:

```ts
function renderMetadata(
  container: HTMLElement,
  metadata: LinkMetadata,
  host: CardHost,
  context: CardContext,
): void {
  const compact = context.layout === 'compact';
  container.replaceChildren();
  container.className = `glance-card${metadata.degraded ? ' is-degraded' : ''}${compact ? ' is-compact' : ''}`;
  container.setAttribute('aria-label', metadata.title);
```

Gate the description on the layout — change the condition at `card.ts:66` to:

```ts
  if (!compact && host.settings().showDescription && metadata.description) {
```

Replace every remaining `source.url` with `context.line.url` and `source.label` with `context.line.label` inside `renderMetadata`.

Move the media append so DOM order is visual order — delete the `container.append(createImage(metadata))` call at `card.ts:54-56` and change the final append at `card.ts:131` to:

```ts
  const media = host.settings().showThumbnail && metadata.image ? createImage(metadata) : null;
  container.append(body);
  if (media) container.append(media);
  container.append(copy, refresh, link);
```

- [ ] **Step 6: Update `mountCard`**

```ts
export function mountCard(
  wrapper: HTMLElement,
  context: CardContext,
  host: CardHost,
): () => void {
  const card = document.createElement('div');
  wrapper.append(card);

  const { url, label } = context.line;
  const current = host.store.get(url);
  if (current) renderMetadata(card, current, host, context);
  else createSkeleton(card, context);

  const unsubscribe = host.store.subscribe(url, (metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, context);
  });
  void host.store.ensure(url, label).then((metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, context);
  });
  return unsubscribe;
}
```

- [ ] **Step 7: Build the context in `editor.ts`**

Change `LinkCardWidget` to carry the context and compare it:

```ts
class LinkCardWidget extends WidgetType {
  private unmount = new WeakMap<HTMLElement, () => void>();
  private readonly showDescription: boolean;
  private readonly showThumbnail: boolean;

  constructor(
    private readonly context: CardContext,
    private readonly host: CardHost,
  ) {
    super();
    const settings = host.settings();
    this.showDescription = settings.showDescription;
    this.showThumbnail = settings.showThumbnail;
  }

  eq(other: LinkCardWidget): boolean {
    return this.context.line.url === other.context.line.url &&
      this.context.line.label === other.context.line.label &&
      this.context.layout === other.context.layout &&
      this.context.marker === other.context.marker &&
      this.context.line.checked === other.context.line.checked &&
      this.context.line.indentLevel === other.context.line.indentLevel &&
      this.showDescription === other.showDescription &&
      this.showThumbnail === other.showThumbnail;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'glance-editor-card';
    wrapper.style.setProperty('--glance-indent', String(this.context.line.indentLevel));
    this.unmount.set(wrapper, mountCard(wrapper, this.context, this.host));
    return wrapper;
  }
  // destroy and ignoreEvent unchanged
}
```

In `lineDecoration`, build the context:

```ts
  const line = parseGlanceLine(text);
  if (!line || lineHasSelection(state, lineFrom, lineTo)) return null;
  const context: CardContext = {
    line,
    layout: resolveLayout(line, host.settings()),
    marker: line.list,
    editable: true,
  };
```

and pass `context` to `new LinkCardWidget(context, host)`.

Import `resolveLayout` and `CardContext` from `./card.ts`.

- [ ] **Step 8: Build the context in `reading.ts`**

In `mountFor`, replace the `LinkSource` construction with a context. Reading mode has no source line yet — that arrives in Task 7 — so synthesise a minimal one:

```ts
function mountFor(
  anchor: HTMLAnchorElement,
  host: CardHost,
): { card: HTMLElement; mount: ReadingCardMount } {
  const card = document.createElement('div');
  card.className = 'glance-reading-card';
  const text = anchor.textContent?.trim();
  const label = text && text !== anchor.href ? text : undefined;
  const line: GlanceLine = {
    url: anchor.href,
    ...(label ? { label } : {}),
    prefix: '',
    linkText: anchor.href,
    suffix: '',
    indentLevel: 0,
    list: 'none',
  };
  const context: CardContext = {
    line,
    layout: host.settings().defaultCardLayout,
    marker: 'none',
    editable: false,
  };
  return { card, mount: new ReadingCardMount(card, context, host) };
}
```

Change `ReadingCardMount`'s constructor parameter type from `LinkSource` to `CardContext` and pass it straight to `mountCard`.

- [ ] **Step 9: Add the setting control**

In `src/settings.ts`, add a dropdown alongside the existing controls:

```ts
    new Setting(containerEl)
      .setName('Default card size')
      .setDesc(
        'Applies to every card. Override a single line with %%glance:compact%% or %%glance:expand%%.',
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('expanded', 'Expanded')
          .addOption('compact', 'Compact')
          .setValue(this.plugin.settings.defaultCardLayout)
          .onChange(async (value) => {
            this.plugin.settings.defaultCardLayout = value as CardLayout;
            await this.plugin.savePluginData();
            this.plugin.refreshEditors();
          }),
      );
```

Match the surrounding file's existing style for how it saves and refreshes — read `settings.ts` first and follow whatever pattern the other controls already use rather than introducing a second one.

- [ ] **Step 10: Add the compact styles**

In `styles.css`, add a media-width custom property to `.glance-card` and consume it. In the `.glance-card` rule add:

```css
  --glance-media-w: 150px;
```

Change the `.glance-card__media, .glance-card__skeleton-media` rule to use it:

```css
.glance-card__media,
.glance-card__skeleton-media {
  flex: 0 0 var(--glance-media-w);
  width: var(--glance-media-w);
  min-height: 64px;
  overflow: hidden;
  background: var(--background-modifier-hover);
  border-radius: 8px;
}
```

Note the `order: 2` declaration is gone — DOM order is now visual order.

Then add the compact rules. They must sit **after** the `.glance-card.is-degraded` rule so a card that is both compact and degraded lands on the compact height by source order, never by `!important`:

```css
/* Compact keeps the image and narrows it, rather than dropping it: a link row
   still reads as a card, just one line tall. Ordered after .is-degraded so a
   degraded compact card takes the compact height without an !important. */
.glance-card.is-compact {
  --glance-media-w: 64px;
  min-height: 52px;
}

.glance-card.is-compact .glance-card__title {
  -webkit-line-clamp: 1;
  font-size: 15px;
}

.glance-card.is-compact .glance-card__media,
.glance-card.is-compact .glance-card__skeleton-media {
  min-height: 36px;
}
```

Add the indentation rule next to the wrapper rules at the top of the file:

```css
/* Live Preview replaces the whole line, indent included, so the nesting has
   to be re-applied to the wrapper. Reading mode keeps its real <li> nesting
   and needs none of this. */
.glance-editor-card {
  padding-left: calc(var(--glance-indent, 0) * 1.7em);
}
```

- [ ] **Step 11: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS. `style-contract.test.ts` must stay green — the new rules contain no `!important`, no raw `ms`/hex/`cubic-bezier`, and no `:hover`.

- [ ] **Step 12: Verify in the vault**

Run: `pnpm build`, reload Obsidian, then in a scratch note check:
- a bare link renders expanded;
- `https://obsidian.md %%glance:compact%%` renders compact **with** a narrow image, not without one;
- flipping the setting to Compact flips unmarked cards and leaves marked ones alone.

- [ ] **Step 13: Commit**

```bash
git add src/model.ts src/card.ts src/card-context.test.ts src/editor.ts src/reading.ts src/settings.ts styles.css
git commit -m "feat(layout): compact card variant with a global default and per-line markers

Adds a Default card size setting plus symmetric %%glance:compact%% and
%%glance:expand%% overrides, resolved once into a CardContext that mountCard
now takes in place of a bare LinkSource. Compact drops the description and
narrows the image from 150px to 64px rather than hiding it.

Media moves after body in DOM order, retiring the order: 2 juggling.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Marker slot for bullets and ordered items

Delivers item 3. CodeMirror requires `block: true` widgets to span whole lines, so the native list marker cannot survive inside the replaced range — the card draws it.

**Files:**
- Create: `src/card-marker.ts`
- Modify: `src/card.ts` (render the slot)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `CardContext` (Task 3), `GlanceLine`, `ListKind` (Task 2).
- Produces: `createMarker(context: CardContext, onToggle?: (checked: boolean) => void): HTMLElement | null` — returns `null` when `context.marker === 'none'`. The `onToggle` parameter is unused until Task 5; declare it now so Task 5 does not change the signature.

- [ ] **Step 1: Create the marker module**

Create `src/card-marker.ts`:

```ts
import type { CardContext } from './card.ts';

/**
 * Draws the list marker the card had to swallow. A CodeMirror `block: true`
 * widget must span whole lines, so the native bullet cannot be left standing
 * outside the replaced range — and an inline widget the height of a card
 * corrupts the height map (see the note in editor.ts). Reading mode keeps its
 * real <li> marker and passes `marker: 'none'`, so nothing is drawn there.
 */
export function createMarker(
  context: CardContext,
  onToggle?: (checked: boolean) => void,
): HTMLElement | null {
  if (context.marker === 'none') return null;

  const slot = document.createElement('div');
  slot.className = 'glance-card__marker';

  if (context.marker === 'ordered') {
    slot.addClass('glance-card__marker--ordered');
    slot.textContent = orderedMarkerText(context.line.prefix);
    return slot;
  }

  if (context.marker === 'bullet') {
    slot.addClass('glance-card__marker--bullet');
    return slot;
  }

  slot.addClass('glance-card__marker--task');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  // Obsidian's own class, so themes — Cosmos included — skin this checkbox
  // exactly like a native task checkbox with no styling of our own.
  checkbox.className = 'task-list-item-checkbox';
  checkbox.checked = context.line.checked === true;
  checkbox.disabled = !context.editable;
  if (onToggle) {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      onToggle(checkbox.checked);
    });
  }
  slot.append(checkbox);
  return slot;
}

function orderedMarkerText(prefix: string): string {
  return /(\d{1,9}[.)])/.exec(prefix)?.[1] ?? '';
}
```

- [ ] **Step 2: Render the slot in `card.ts`**

In `renderMetadata`, immediately after setting `container.className` and the aria label, insert the marker before the body:

```ts
  const marker = createMarker(context);
```

and include it in the final append, first in order:

```ts
  if (marker) container.append(marker);
  container.append(body);
  if (media) container.append(media);
  container.append(copy, refresh, link);
```

Do the same in `createSkeleton` — a skeleton in a list must reserve the same slot so the card does not jump sideways when metadata lands:

```ts
  const marker = createMarker(context);
  if (marker) container.append(marker);
  container.append(body, media);
```

Import `createMarker` from `./card-marker.ts`.

- [ ] **Step 3: Style the slot**

Add to `styles.css`, after the `.glance-card__body` rule:

```css
.glance-card__marker {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  min-height: 22px;
  color: var(--text-faint);
  font-family: var(--font-interface);
  font-size: 13px;
  line-height: 1.25;
}

.glance-card__marker--bullet::before {
  content: '';
  width: 5px;
  height: 5px;
  background: currentColor;
  border-radius: 50%;
}

.glance-card__marker--task {
  color: var(--text-muted);
}
```

The card's flex row already aligns items via `align-items` defaults; the slot centres its own content so a bullet sits on the title's optical line.

- [ ] **Step 4: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Verify in the vault**

Run: `pnpm build`, reload, then check in Live Preview:
- `- https://obsidian.md` shows a bullet **and** a card;
- `3. https://obsidian.md` shows `3.` and a card;
- `  - https://obsidian.md` is indented one level relative to the unindented one;
- Reading mode still shows the native bullet and does **not** draw a second one.

- [ ] **Step 6: Commit**

```bash
git add src/card-marker.ts src/card.ts styles.css
git commit -m "feat(lists): draw the list marker the card had to swallow

A block: true decoration must span whole lines, so the native bullet cannot
survive inside the replaced range and an inline widget of card height would
corrupt CodeMirror's height map. The card draws a bullet or the ordered
marker itself, in a fixed leading slot, and the wrapper re-applies the
nesting the replaced line carried.

Reading mode passes marker: 'none' and keeps its real <li> marker.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Task items, the redrawn checkbox, and the write path

Delivers item 4 and introduces `line-write.ts` — the only module in the codebase that mutates the document.

**Files:**
- Create: `src/line-write.ts`
- Create: `src/line-write.test.ts`
- Modify: `src/card.ts` (`CardWriter` on the context, wire the toggle)
- Modify: `src/editor.ts` (bind the writer)
- Modify: `src/editor-safety.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `GlanceLine`, `parseGlanceLine`, `serializeGlanceLine` (Task 2); `CardContext` (Task 3); `createMarker` (Task 4).
- Produces:
  - `withLink(line: GlanceLine, url: string): GlanceLine`
  - `withLayout(line: GlanceLine, layout: CardLayout | undefined): GlanceLine`
  - `withChecked(line: GlanceLine, checked: boolean): GlanceLine`
  - `interface CardWriter { setLink(url: string): void; setLayout(layout: CardLayout | undefined): void; setChecked(checked: boolean): void }`
  - `bindWriter(view: EditorView, dom: HTMLElement): CardWriter`

- [ ] **Step 1: Write the failing tests**

Create `src/line-write.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGlanceLine, serializeGlanceLine } from './link-source.ts';
import { withChecked, withLayout, withLink } from './line-write.ts';

function transform(
  text: string,
  change: (line: NonNullable<ReturnType<typeof parseGlanceLine>>) => ReturnType<typeof withLink>,
): string {
  const line = parseGlanceLine(text);
  assert.ok(line, `expected to parse: ${text}`);
  return serializeGlanceLine(change(line));
}

test('withChecked flips only the checkbox character', () => {
  assert.equal(
    transform('- [ ] https://obsidian.md', (line) => withChecked(line, true)),
    '- [x] https://obsidian.md',
  );
  assert.equal(
    transform('- [x] https://obsidian.md', (line) => withChecked(line, false)),
    '- [ ] https://obsidian.md',
  );
});

test('withChecked preserves indentation, spacing and the layout marker', () => {
  assert.equal(
    transform('\t-   [ ] https://obsidian.md %%glance:compact%%', (line) => withChecked(line, true)),
    '\t-   [x] https://obsidian.md %%glance:compact%%',
  );
});

test('withLayout adds, replaces and removes the marker', () => {
  assert.equal(
    transform('https://obsidian.md', (line) => withLayout(line, 'compact')),
    'https://obsidian.md %%glance:compact%%',
  );
  assert.equal(
    transform('https://obsidian.md %%glance:compact%%', (line) => withLayout(line, 'expanded')),
    'https://obsidian.md %%glance:expand%%',
  );
  assert.equal(
    transform('https://obsidian.md %%glance:compact%%', (line) => withLayout(line, undefined)),
    'https://obsidian.md',
  );
});

test('withLayout leaves the list prefix untouched', () => {
  assert.equal(
    transform('- [x] https://obsidian.md', (line) => withLayout(line, 'compact')),
    '- [x] https://obsidian.md %%glance:compact%%',
  );
});

test('withLink swaps the url and keeps a markdown label', () => {
  assert.equal(
    transform('https://obsidian.md', (line) => withLink(line, 'https://example.com')),
    'https://example.com',
  );
  assert.equal(
    transform('[Obsidian](https://obsidian.md)', (line) => withLink(line, 'https://example.com')),
    '[Obsidian](https://example.com)',
  );
});

test('withLink keeps the prefix and the layout marker', () => {
  assert.equal(
    transform('  - [ ] https://obsidian.md %%glance:compact%%', (line) =>
      withLink(line, 'https://example.com'),
    ),
    '  - [ ] https://example.com %%glance:compact%%',
  );
});

test('withLink rejects a non-web url and returns the line unchanged', () => {
  assert.equal(
    transform('https://obsidian.md', (line) => withLink(line, 'javascript:alert(1)')),
    'https://obsidian.md',
  );
});

test('the transforms are pure and never mutate their input', () => {
  const line = parseGlanceLine('- [ ] https://obsidian.md');
  assert.ok(line);
  withChecked(line, true);
  withLayout(line, 'compact');
  withLink(line, 'https://example.com');
  assert.equal(serializeGlanceLine(line), '- [ ] https://obsidian.md');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `src/line-write.ts` does not exist.

- [ ] **Step 3: Write the transforms**

Create `src/line-write.ts`:

```ts
import type { EditorView } from '@codemirror/view';

import { isSafeWebUrl, parseGlanceLine, serializeGlanceLine } from './link-source.ts';
import type { CardLayout, GlanceLine } from './model.ts';

/**
 * The only module in this plugin that mutates the document.
 *
 * The three `with*` functions are pure line transforms over the verbatim
 * slices, so a write touches one slice and leaves the rest byte-identical:
 * a checkbox click can never reformat spacing or drop a Markdown link title.
 * `bindWriter` is the sole holder of `view.dispatch`, which is what keeps
 * `editor.ts` free of `changes:` and the decoration pipeline pure.
 */

export function withChecked(line: GlanceLine, checked: boolean): GlanceLine {
  if (line.list !== 'task') return line;
  return {
    ...line,
    checked,
    prefix: line.prefix.replace(/\[[ xX]\]/, checked ? '[x]' : '[ ]'),
  };
}

export function withLayout(line: GlanceLine, layout: CardLayout | undefined): GlanceLine {
  const suffix = layout ? ` %%glance:${layout === 'compact' ? 'compact' : 'expand'}%%` : '';
  const next: GlanceLine = { ...line, suffix };
  if (layout) next.layout = layout;
  else delete next.layout;
  return next;
}

export function withLink(line: GlanceLine, url: string): GlanceLine {
  const trimmed = url.trim();
  if (!isSafeWebUrl(trimmed)) return line;
  return {
    ...line,
    url: trimmed,
    linkText: line.label ? `[${line.label}](${trimmed})` : trimmed,
  };
}

export interface CardWriter {
  setLink(url: string): void;
  setLayout(layout: CardLayout | undefined): void;
  setChecked(checked: boolean): void;
}

export function bindWriter(view: EditorView, dom: HTMLElement): CardWriter {
  const apply = (change: (line: GlanceLine) => GlanceLine): void => {
    // The widget does not know its own position and the position moves, so it
    // is resolved at click time. posAtCoords does not resolve inside embedded
    // blocks; posAtDOM does.
    const pos = view.posAtDOM(dom);
    const target = view.state.doc.lineAt(pos);
    const parsed = parseGlanceLine(target.text);
    if (!parsed) return;

    const insert = serializeGlanceLine(change(parsed));
    if (insert === target.text) return;
    view.dispatch({ changes: { from: target.from, to: target.to, insert } });
  };

  return {
    setLink: (url) => apply((line) => withLink(line, url)),
    setLayout: (layout) => apply((line) => withLayout(line, layout)),
    setChecked: (checked) => apply((line) => withChecked(line, checked)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Guard the write path's location**

Append to `src/editor-safety.test.ts`:

```ts
const lineWriteSourceUrl = new URL('./line-write.ts', import.meta.url);
const cardActionsSourceUrl = new URL('./card-actions.ts', import.meta.url);

test('line-write.ts is the only module that dispatches a document change', async () => {
  // README's source-pure promise rests on the decoration pipeline never
  // mutating the document. Confining every dispatch to one module is what
  // makes that auditable — and is why editor.ts's `changes:` guard above
  // can stay in place while the card gained write actions.
  const writeSource = await readFile(lineWriteSourceUrl, 'utf8');
  assert.match(writeSource, /view\.dispatch\(/);

  for (const url of [editorSourceUrl, cardSourceUrl, cardActionsSourceUrl]) {
    const source = await readFile(url, 'utf8').catch(() => '');
    assert.doesNotMatch(source, /\.dispatch\(/, `unexpected dispatch in ${url.pathname}`);
  }
});
```

`card-actions.ts` does not exist until Task 6; the `.catch(() => '')` makes the assertion pass over a missing file now and start guarding it the moment it lands.

- [ ] **Step 6: Add the writer to the context and wire the checkbox**

In `src/card.ts`, add to `CardContext`:

```ts
  write?: CardWriter;
```

importing `CardWriter` from `./line-write.ts`. Then in `renderMetadata` and `createSkeleton`, pass the toggle through:

```ts
  const marker = createMarker(context, context.write
    ? (checked) => context.write?.setChecked(checked)
    : undefined);
```

In `src/editor.ts`, admit tasks and bind the writer inside `toDOM`:

```ts
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'glance-editor-card';
    wrapper.style.setProperty('--glance-indent', String(this.context.line.indentLevel));
    const context: CardContext = { ...this.context, write: bindWriter(view, wrapper) };
    this.unmount.set(wrapper, mountCard(wrapper, context, this.host));
    return wrapper;
  }
```

Import `bindWriter` from `./line-write.ts` and `EditorView` is already imported.

- [ ] **Step 7: Style the task slot**

Add to `styles.css`, after the `.glance-card__marker--task` rule:

```css
.glance-card.is-task-checked .glance-card__title {
  color: var(--text-muted);
  text-decoration: line-through;
}
```

And set that class in `renderMetadata` — extend the `container.className` expression to append `' is-task-checked'` when `context.marker === 'task' && context.line.checked === true`.

- [ ] **Step 8: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS. `editor-safety.test.ts`'s original `changes:` assertion on `editor.ts` must still hold — `editor.ts` calls `bindWriter` but contains no `changes:` itself.

- [ ] **Step 9: Verify in the vault**

Run: `pnpm build`, reload, then in Live Preview:
- `- [ ] https://obsidian.md` renders a checkbox **and** a card;
- clicking the checkbox writes `- [x]` into the file — check the raw Markdown by switching to source mode;
- clicking it does not reformat the rest of the line;
- Reading mode shows the native checkbox and still toggles it.

- [ ] **Step 10: Commit**

```bash
git add src/line-write.ts src/line-write.test.ts src/card.ts src/card-marker.ts src/editor.ts src/editor-safety.test.ts styles.css
git commit -m "feat(tasks): cards inside task items with a card-drawn checkbox

Task lines now render cards. The checkbox is redrawn by the card, carrying
Obsidian's own task-list-item-checkbox class so themes skin it natively, and
toggling it rewrites the single checkbox character in place.

Introduces line-write.ts as the only module holding view.dispatch: the three
transforms are pure line functions and position is resolved at click time via
posAtDOM. editor.ts keeps its changes: guard, so the decoration pipeline
stays pure and every mutation is confined to one auditable file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Action pill and the size toggle

Delivers item 6 and the housing for item 1. Consolidates the two free-floating icon boxes into one shared surface and adds the size toggle.

**Files:**
- Create: `src/card-actions.ts`
- Modify: `src/card.ts` (delegate button rendering)
- Modify: `styles.css:143-186` and `styles.css:263-281`

**Interfaces:**
- Consumes: `CardContext`, `CardWriter` (Task 5), `CardHost` (existing).
- Produces: `createActions(context: CardContext, host: CardHost, onEdit?: () => void): HTMLElement`. `onEdit` is unused until Task 7; declare it now.

- [ ] **Step 1: Extract the actions into their own module**

Create `src/card-actions.ts` and move the copy and refresh button construction out of `card.ts:90-122` verbatim, wrapping them in a shared container and adding the size toggle:

```ts
import { setIcon } from 'obsidian';

import type { CardContext, CardHost } from './card.ts';

export function createActions(
  context: CardContext,
  host: CardHost,
  onEdit?: () => void,
): HTMLElement {
  // One surface for every action rather than four independent boxes: four
  // shadowed 28px squares would cover 144px of the artwork.
  const pill = document.createElement('div');
  pill.className = 'glance-card__actions';

  if (context.editable && onEdit) {
    pill.append(action('edit', 'pencil', 'Edit link', () => onEdit()));
  }

  pill.append(action('copy', 'copy', 'Copy link', (button) => {
    void navigator.clipboard.writeText(context.line.url).then(() => {
      button.addClass('is-copied');
      setIcon(button, 'check');
      window.setTimeout(() => {
        button.removeClass('is-copied');
        setIcon(button, 'copy');
      }, 1200);
    });
  }));

  pill.append(action('refresh', 'refresh-cw', 'Refresh link preview', (button) => {
    button.addClass('is-spinning');
    void host.store.refresh(context.line.url, context.line.label).finally(() => {
      button.removeClass('is-spinning');
    });
  }));

  if (context.editable && context.write) {
    const compact = context.layout === 'compact';
    pill.append(action(
      'size',
      compact ? 'chevrons-up-down' : 'chevrons-down-up',
      compact ? 'Expand card' : 'Collapse card',
      () => context.write?.setLayout(compact ? 'expanded' : 'compact'),
    ));
  }

  return pill;
}

function action(
  name: string,
  icon: string,
  label: string,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `glance-card__action glance-card__action--${name} clickable-icon`;
  button.setAttribute('aria-label', label);
  setIcon(button, icon);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}
```

The copy button's timeout no longer needs the `copyResetHandle` clearing dance from `card.ts:95,102-103` — each button owns its own closure and a second click restarts from a clean icon state either way. Keep the behaviour identical otherwise.

Export `CardHost` from `card.ts` if it is not already exported — it is, at `card.ts:7`.

- [ ] **Step 2: Use it from `card.ts`**

Delete `card.ts:90-122` (the copy and refresh construction) and replace the final append with:

```ts
  if (marker) container.append(marker);
  container.append(body);
  if (media) container.append(media);
  container.append(createActions(context, host), link);
```

Import `createActions` from `./card-actions.ts`.

- [ ] **Step 3: Restyle as one pill**

Replace the `.glance-card__refresh, .glance-card__copy` block at `styles.css:143-190` — every rule referencing those two class names, including `.glance-card__refresh { right: 8px }`, `.glance-card__copy { right: 44px }`, the `:focus-visible` rule, the `@media (hover: hover)` reveal, `.is-copied` and `.is-spinning` — with:

```css
.glance-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  gap: 2px;
  padding: 2px;
  opacity: 0;
  background: var(--background-primary);
  border-radius: var(--mv-r1, 7px);
  box-shadow: var(--shadow-s, 0 1px 2px rgb(0 0 0 / 12%));
  /* An opacity reveal is a colour wash in mv-kit §6's vocabulary, not a
     physical transform lift, so it eases with --mv-wash. */
  transition: opacity var(--cosmos-t-fast, 140ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1));
}

.glance-card__action {
  width: 28px;
  height: 28px;
  padding: 6px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  box-shadow: none;
}

.glance-card__actions:focus-within {
  opacity: 1;
}

/* mv-kit §6: gated because the card is inline document content and directly
   tappable on phone — a bare :hover would leave the pill stuck visible after
   a tap, since touch has no pointer-leave. The phone block below forces the
   pill visible instead. */
@media (hover: hover) {
  .glance-card:hover .glance-card__actions {
    opacity: 1;
  }
}

.glance-card__action.is-copied {
  color: var(--text-success, var(--interactive-accent));
}

.glance-card__action.is-spinning svg {
  animation: glance-spin var(--cosmos-t-spin, 700ms) linear infinite;
}
```

In the `@media (max-width: 600px)` block, replace the `.glance-card__refresh, .glance-card__copy { opacity: 1 }` rule and the `::after` touch-target rule with:

```css
  .glance-card__actions {
    opacity: 1;
  }

  /* mv-kit §2 MUST: every phone tap target reaches --cosmos-touch-min. The
     buttons stay visually 28px and extend their hit area with a transparent
     pseudo-element, the same pattern as TabX's .tabx-tab-close. */
  .glance-card__action {
    position: relative;
  }

  .glance-card__action::after {
    content: '';
    position: absolute;
    inset: calc((100% - var(--cosmos-touch-min, 44px)) / 2);
  }
```

Finally, update the `@media (prefers-reduced-motion: reduce)` block at the bottom: replace `.glance-card__refresh` with `.glance-card__actions, .glance-card__action`.

- [ ] **Step 4: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS. Pay attention to `style-contract.test.ts`: the new `:hover` selector must be inside the `hover: hover` gate, and the `rgb(0 0 0 / 12%)` and `700ms` values must remain inside `var()` fallbacks.

- [ ] **Step 5: Verify in the vault**

Run: `pnpm build`, reload, then check:
- hovering a card reveals one pill, not four separate boxes;
- the size toggle flips the card and writes the marker into the file;
- the toggle works on a card inside a bullet list and inside a task;
- Reading mode shows copy and refresh only.

- [ ] **Step 6: Commit**

```bash
git add src/card-actions.ts src/card.ts styles.css
git commit -m "feat(actions): one action pill, with a card size toggle

Copy and refresh were two independent 28px boxes with their own background
and shadow; a third and fourth action that way would checkerboard 144px over
the artwork. They move into one shared surface, extracted to card-actions.ts.

Adds the size toggle, which writes %%glance:compact%% or %%glance:expand%%
into the line and so works inside bullet lists and tasks as well as outside.
Edit and size render only where the card is editable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Inline link editing

Delivers item 1.

**Files:**
- Modify: `src/card-actions.ts` (the edit input)
- Modify: `src/card.ts` (mount the editor)
- Modify: `src/editor.ts` (`editingLineField`)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `createActions` (Task 6), `CardWriter` (Task 5).
- Produces: `beginInlineEdit: StateEffect<number>`, `endInlineEdit: StateEffect<null>`, `editingLineField: StateField<number | null>` exported from `editor.ts`.

- [ ] **Step 1: Add the editing-line field to `editor.ts`**

```ts
export const beginInlineEdit = StateEffect.define<number>();
export const endInlineEdit = StateEffect.define<null>();

/** Holds the `from` of the line whose card is being edited inline. Without
 *  it, any transaction moving the selection onto that line would hit the
 *  lineHasSelection bailout, drop the decoration and unmount the card
 *  mid-typing. */
export const editingLineField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(beginInlineEdit)) return effect.value;
      if (effect.is(endInlineEdit)) return null;
    }
    if (value === null) return null;
    return transaction.changes.mapPos(value);
  },
});
```

Return it alongside the decoration field from `glanceEditorExtension`:

```ts
export function glanceEditorExtension(host: CardHost): Extension {
  return [editingLineField, decorationField(host)];
}
```

moving the existing `StateField.define<DecorationSet>` body into a local `decorationField(host)` function.

- [ ] **Step 2: Consult it in `lineDecoration`**

Change the bailout so an edited line survives a selection landing on it:

```ts
function lineDecoration(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
  text: string,
  host: CardHost,
): Range<Decoration> | null {
  const line = parseGlanceLine(text);
  if (!line) return null;
  const editing = state.field(editingLineField, false) === lineFrom;
  if (!editing && lineHasSelection(state, lineFrom, lineTo)) return null;
  ...
```

- [ ] **Step 3: Make the effect reach the decoration field**

`updateDecorations` returns early when neither the document nor the selection changed, which would swallow an effect-only transaction. Extend that guard:

```ts
  const editingChanged =
    transaction.startState.field(editingLineField, false) !==
    transaction.state.field(editingLineField, false);
  const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
  if (!transaction.docChanged && !selectionChanged && !editingChanged) return decorations;
```

and include both editing positions in `touchedLineRanges` so the line is re-parsed:

```ts
  const startEditing = transaction.startState.field(editingLineField, false);
  const endEditing = transaction.state.field(editingLineField, false);
  if (startEditing !== null && startEditing !== undefined) {
    push(transaction.changes.mapPos(startEditing), transaction.changes.mapPos(startEditing));
  }
  if (endEditing !== null && endEditing !== undefined) push(endEditing, endEditing);
```

`touchedLineRanges` takes only the transaction today; it already has everything it needs.

- [ ] **Step 4: Build the input in `card-actions.ts`**

```ts
export function createInlineEditor(
  url: string,
  onCommit: (url: string) => void,
  onCancel: () => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'glance-card__edit';
  input.value = url;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Link URL');

  let settled = false;
  const settle = (commit: boolean): void => {
    if (settled) return;
    settled = true;
    if (commit) onCommit(input.value);
    else onCancel();
  };

  input.addEventListener('keydown', (event) => {
    // The card lives inside contenteditable content; without this every
    // keystroke would also reach CodeMirror's own key handling.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      settle(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      settle(false);
    }
  });
  input.addEventListener('blur', () => settle(false));
  input.addEventListener('click', (event) => event.stopPropagation());

  return input;
}
```

- [ ] **Step 5: Mount it from `card.ts`**

In `renderMetadata`, pass an `onEdit` callback into `createActions` that swaps the input into the top of the body:

```ts
  const startEdit = context.editable && context.write
    ? () => {
        if (body.querySelector('.glance-card__edit')) return;
        const input = createInlineEditor(
          context.line.url,
          (url) => {
            context.onEditEnd?.();
            context.write?.setLink(url);
          },
          () => {
            input.remove();
            context.onEditEnd?.();
          },
        );
        body.prepend(input);
        context.onEditBegin?.();
        input.focus();
        input.select();
      }
    : undefined;
```

and pass `startEdit` as the third argument to `createActions`.

Add the two optional hooks to `CardContext`:

```ts
  onEditBegin?: () => void;
  onEditEnd?: () => void;
```

- [ ] **Step 6: Wire the hooks in `editor.ts`**

In `toDOM(view)`, extend the context:

```ts
    const context: CardContext = {
      ...this.context,
      write: bindWriter(view, wrapper),
      onEditBegin: () => {
        const pos = view.posAtDOM(wrapper);
        view.dispatch({ effects: beginInlineEdit.of(view.state.doc.lineAt(pos).from) });
      },
      onEditEnd: () => view.dispatch({ effects: endInlineEdit.of(null) }),
    };
```

These dispatch **effects**, not changes, so `editor.ts` still contains no `changes:`. The `.dispatch(` guard added in Task 5 excludes `editor.ts` — update that guard's exclusion list to drop `editorSourceUrl`, and add a narrower assertion in its place:

```ts
test('editor.ts dispatches effects only, never document changes', async () => {
  const source = await readFile(editorSourceUrl, 'utf8');
  assert.match(source, /view\.dispatch\(\{\s*effects:/);
  assert.doesNotMatch(source, /\bchanges\s*:/);
});
```

The original `changes:` assertion in the first test already covers the second half; keeping it here documents the pairing at the point where `dispatch` appears.

- [ ] **Step 7: Style the input**

```css
.glance-card__edit {
  z-index: 2;
  width: 100%;
  min-width: 0;
  margin-bottom: 4px;
  padding: 4px 8px;
  color: var(--text-normal);
  font-family: var(--font-interface);
  font-size: 14px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border-focus);
  border-radius: var(--mv-r1, 7px);
}
```

- [ ] **Step 8: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Verify in the vault**

Run: `pnpm build`, reload, then in Live Preview:
- the pencil reveals an input holding the current URL, focused and selected;
- typing does not move the CodeMirror cursor or dissolve the card;
- Enter rewrites the line and the card refetches;
- Escape and clicking away both leave the line untouched;
- editing `[Obsidian](https://obsidian.md)` keeps the label.

- [ ] **Step 10: Commit**

```bash
git add src/card-actions.ts src/card.ts src/editor.ts src/editor-safety.test.ts styles.css
git commit -m "feat(edit): edit a card's link inline

The pencil reveals an input over the card body holding the current URL;
Enter commits, Escape and blur cancel, and a Markdown link keeps its label.

Adds editingLineField so a selection landing on the edited line no longer
hits the lineHasSelection bailout and unmounts the card mid-typing, with
the effect threaded into touchedLineRanges so the effect-only transaction
is not swallowed by the docChanged/selectionChanged early return.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Reading mode — tasks and layout markers

**Files:**
- Modify: `src/reading.ts`

**Interfaces:**
- Consumes: `parseGlanceLine`, `resolveLayout`, `CardContext`.
- Produces: nothing new.

- [ ] **Step 1: Admit task items**

At `reading.ts:75`, drop `input` from the skip filter:

```ts
      if (item.querySelector('ul, ol, .glance-reading-card')) continue;
```

and make anchor detection ignore the native checkbox. Change `onlyExternalAnchor` to skip checkbox inputs when counting children:

```ts
function onlyExternalAnchor(container: HTMLElement): HTMLAnchorElement | null {
  // A task <li> holds the native checkbox alongside the anchor. The checkbox
  // stays exactly where Obsidian put it — Reading mode is read-only for
  // Glance, and its own checkbox already works.
  const elements = Array.from(container.children).filter(
    (child) => !(child instanceof HTMLInputElement),
  );
  if (elements.length !== 1) return null;
  const anchor = elements[0];
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (!/^https?:\/\//i.test(anchor.href)) return null;
  const meaningfulText = Array.from(container.childNodes)
    .filter((node) => node !== anchor && !(node instanceof HTMLInputElement))
    .some((node) => (node.textContent ?? '').trim().length > 0);
  return meaningfulText ? null : anchor;
}
```

- [ ] **Step 2: Resolve the layout from the section source**

Obsidian strips `%%…%%` comments from rendered output, so the marker never reaches the DOM. Read it from the source instead. Add to `reading.ts`:

```ts
/** Parses the source lines of this section once, so each mounted card can be
 *  matched to its own line. Matching walks in document order and consumes
 *  each candidate, so a URL repeated in one section still maps correctly. */
function sectionLines(
  element: HTMLElement,
  context: MarkdownPostProcessorContext,
): GlanceLine[] {
  const info = context.getSectionInfo(element);
  if (!info) return [];
  return info.text
    .split('\n')
    .slice(info.lineStart, info.lineEnd + 1)
    .map((text) => parseGlanceLine(text))
    .filter((line): line is GlanceLine => line !== null);
}
```

In the processor, build the candidate list once and consume it:

```ts
export function glanceReadingProcessor(host: CardHost): MarkdownPostProcessor {
  return (element, context) => {
    const candidates = sectionLines(element, context);
    const takeLine = (url: string): GlanceLine | undefined => {
      const index = candidates.findIndex((line) => line.url === url);
      if (index === -1) return undefined;
      return candidates.splice(index, 1)[0];
    };
    ...
```

and pass `takeLine(anchor.href)` into `mountFor`, which uses it when present:

```ts
function mountFor(
  anchor: HTMLAnchorElement,
  host: CardHost,
  sourceLine: GlanceLine | undefined,
): { card: HTMLElement; mount: ReadingCardMount } {
  const card = document.createElement('div');
  card.className = 'glance-reading-card';
  const text = anchor.textContent?.trim();
  const label = text && text !== anchor.href ? text : undefined;
  const line: GlanceLine = sourceLine ?? {
    url: anchor.href,
    ...(label ? { label } : {}),
    prefix: '',
    linkText: anchor.href,
    suffix: '',
    indentLevel: 0,
    list: 'none',
  };
  const context: CardContext = {
    line,
    layout: resolveLayout(line, host.settings()),
    // Obsidian's own bullet and checkbox stay in place here, so the card
    // draws neither.
    marker: 'none',
    editable: false,
  };
  return { card, mount: new ReadingCardMount(card, context, host) };
}
```

- [ ] **Step 3: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Verify in the vault**

Run: `pnpm build`, reload, switch to Reading mode and check:
- `- [ ] https://obsidian.md` renders a card next to a working native checkbox;
- `https://obsidian.md %%glance:compact%%` renders compact;
- the same URL twice in one section, one marked compact and one not, renders one of each;
- no edit or size button appears.

- [ ] **Step 5: Commit**

```bash
git add src/reading.ts
git commit -m "feat(reading): task items render cards, and layout markers are honoured

Task list items are no longer skipped: the native checkbox stays where
Obsidian put it and only the anchor is swapped for a card, so Reading mode
stays read-only.

Obsidian strips %%…%% comments before the post-processor sees the DOM, so
the layout marker is read from the section source via getSectionInfo, with
candidates consumed in document order so a URL repeated inside one section
still maps to its own line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Documentation and release

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`, `package.json`, `versions.json`

- [ ] **Step 1: Correct the source-pure claim**

`README.md:15` currently reads:

```markdown
- Source-pure: a raw URL or standard Markdown link stays unchanged.
```

Rendering still never rewrites Markdown, but the card's own controls now do on explicit user action. Replace that bullet and the one after it with:

```markdown
- Source-pure rendering: displaying a card never rewrites your Markdown.
- Editable in place: the card's own controls — edit link, card size, task
  checkbox — write back to the line, and only when you click them.
```

- [ ] **Step 2: Document the markers and the setting**

Add to the Usage section, after the standard-links paragraph:

```markdown
### Card size

Cards render at the size set by **Default card size** in settings. Override a
single line by appending a marker:

```markdown
https://obsidian.md %%glance:compact%%
https://obsidian.md %%glance:expand%%
```

The card's size toggle writes these for you. `%%…%%` is an Obsidian comment,
so it never shows in Reading mode.

### Lists and tasks

Links inside bullet, numbered and task items render as cards. In Live Preview
the card draws the list marker itself — CodeMirror replaces the whole line, so
the original marker cannot be left standing. In Reading mode Obsidian's own
marker and checkbox stay in place.

```markdown
- https://obsidian.md
- [ ] https://obsidian.md %%glance:compact%%
```
```

- [ ] **Step 3: Bump the version**

This is a feature release: `0.1.4` becomes `0.2.0`. Update `manifest.json`, `package.json`, and add the entry to `versions.json` mapping `"0.2.0"` to the same `minAppVersion` the previous entry uses.

Read `versions.json` first and match its exact existing shape.

- [ ] **Step 4: Run the release gate**

Run: `pnpm release:check`
Expected: PASS — lint, tests and a production build.

- [ ] **Step 5: Commit and tag**

```bash
git add README.md manifest.json package.json versions.json
git commit -m "docs: cards v2 usage, and release 0.2.0

Corrects the source-pure claim now that the card's own controls write back
on explicit user action, and documents the size markers, the Default card
size setting, and cards inside lists and tasks.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag 0.2.0
git push origin main --tags
```

CI publishes the GitHub release on the version-tag push (see `.github/workflows/release.yml`, added in `f03b343`).

---

## Self-review

**Spec coverage.** Every spec section maps to a task: line grammar and the verbatim model to Task 2; DOM structure and the `display:flex` removal to Task 1; layout variants, the setting and the compact image to Task 3; the marker slot to Tasks 4 and 5; the action pill to Task 6; inline edit and `editingLineField` to Task 7; the write path and `CardWriter` to Task 5; Reading mode to Task 8; the documentation follow-up to Task 9. The spec's testing section maps to `link-source.test.ts` (Task 2), `line-write.test.ts` (Task 5), `card-context.test.ts` (Task 3) and the `editor-safety.test.ts` additions (Tasks 1, 5, 7).

**Deviations from the spec, both deliberate:**
1. Verbatim slices instead of reconstructed fields, for exact round-trip — explained at the top of this plan.
2. `CardContext.marker` is separate from `line.list`, so Reading mode can carry a real parsed line while drawing no marker of its own.

**Known ordering hazard.** Task 5 adds a `.dispatch(` guard that excludes `editor.ts`; Task 7 then makes `editor.ts` dispatch effects and narrows that guard. Task 7 Step 6 carries the edit. Executing Task 7 without it leaves a failing test.

**Not covered, by design** (from the spec's non-goals): writing from Reading mode, inline links inside sentences, editing a Markdown link's display text, and repainting Reading-mode views on a settings change.
