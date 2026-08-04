import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';

import { mountCard, type CardHost } from './card.ts';
import { parseGlanceLine } from './link-source.ts';
import type { LinkSource } from './model.ts';

class LinkCardWidget extends WidgetType {
  private unmount = new WeakMap<HTMLElement, () => void>();
  private readonly showDescription: boolean;
  private readonly showThumbnail: boolean;

  constructor(
    private readonly source: LinkSource,
    private readonly host: CardHost,
  ) {
    super();
    const settings = host.settings();
    this.showDescription = settings.showDescription;
    this.showThumbnail = settings.showThumbnail;
  }

  eq(other: LinkCardWidget): boolean {
    return this.source.url === other.source.url &&
      this.source.label === other.source.label &&
      this.showDescription === other.showDescription &&
      this.showThumbnail === other.showThumbnail;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'glance-editor-card';
    this.unmount.set(wrapper, mountCard(wrapper, this.source, this.host));
    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    this.unmount.get(dom)?.();
    this.unmount.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export const refreshGlanceEffect = StateEffect.define<null>();

function lineHasSelection(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => {
    if (range.empty) return range.head >= from && range.head <= to;
    return range.from <= to && range.to >= from;
  });
}

function lineDecoration(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
  text: string,
  host: CardHost,
): Range<Decoration> | null {
  const source = parseGlanceLine(text);
  // The parser recognises task lines, but a block decoration swallows the whole
  // line and the card cannot redraw the checkbox yet. Rendering one here would
  // leave the task uncheckable, so tasks stay unrendered until the card owns a
  // checkbox of its own. Removed when that lands.
  if (!source || source.list === 'task') return null;
  if (lineHasSelection(state, lineFrom, lineTo)) return null;
  // `Decoration.replace` is visual only: the URL stays in EditorState and
  // on disk. Using CodeMirror's native replacement keeps the hidden range
  // cursor-addressable, unlike applying `display: none` to its text DOM.
  return Decoration.replace({
    widget: new LinkCardWidget(source, host),
    block: true,
  }).range(lineFrom, lineTo);
}

function buildDecorations(state: EditorState, host: CardHost): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const decoration = lineDecoration(state, line.from, line.to, line.text, host);
    if (decoration) builder.add(decoration.from, decoration.to, decoration.value);
  }
  return builder.finish();
}

/** Line-expanded, merged ranges (in the new document) whose cards may have
 *  changed this transaction: edited ranges plus the lines the selection
 *  occupied before and after. Everything else is untouched by construction. */
function touchedLineRanges(transaction: Transaction): { from: number; to: number }[] {
  const doc = transaction.state.doc;
  const touched: { from: number; to: number }[] = [];
  const push = (from: number, to: number): void => {
    const clampedFrom = Math.min(Math.max(from, 0), doc.length);
    const clampedTo = Math.min(Math.max(to, clampedFrom), doc.length);
    touched.push({ from: doc.lineAt(clampedFrom).from, to: doc.lineAt(clampedTo).to });
  };
  transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => push(fromB, toB));
  for (const range of transaction.startState.selection.ranges) {
    push(transaction.changes.mapPos(range.from), transaction.changes.mapPos(range.to));
  }
  for (const range of transaction.state.selection.ranges) push(range.from, range.to);

  touched.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const range of touched) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

function updateDecorations(
  decorations: DecorationSet,
  transaction: Transaction,
  host: CardHost,
): DecorationSet {
  // Full rebuild only on explicit refresh (settings toggles, cache clears).
  if (transaction.effects.some((effect) => effect.is(refreshGlanceEffect))) {
    return buildDecorations(transaction.state, host);
  }
  if (!transaction.state.field(editorLivePreviewField, false)) return Decoration.none;
  // Re-entering Live Preview from source mode needs a full pass: while the
  // mode was off this field carried no decorations to map forward.
  if (!transaction.startState.field(editorLivePreviewField, false)) {
    return buildDecorations(transaction.state, host);
  }

  // Obsidian may move the editor selection through transaction shapes that do
  // not expose an explicit `selection` spec, so compare the states directly.
  const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
  if (!transaction.docChanged && !selectionChanged) return decorations;

  // Re-parse only the touched lines; every other decoration is carried over
  // by position mapping. This keeps typing O(edited lines), not O(document).
  const ranges = touchedLineRanges(transaction);
  const add: Range<Decoration>[] = [];
  const doc = transaction.state.doc;
  for (const { from, to } of ranges) {
    let line = doc.lineAt(from);
    for (;;) {
      const decoration = lineDecoration(transaction.state, line.from, line.to, line.text, host);
      if (decoration) add.push(decoration);
      if (line.to >= to || line.number >= doc.lines) break;
      line = doc.line(line.number + 1);
    }
  }
  return decorations.map(transaction.changes).update({
    filterFrom: ranges[0]?.from ?? 0,
    filterTo: ranges[ranges.length - 1]?.to ?? 0,
    filter: (from, to) => !ranges.some((range) => from <= range.to && to >= range.from),
    add,
  });
}

export function glanceEditorExtension(host: CardHost): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, host),
    update: (decorations, transaction) => updateDecorations(decorations, transaction, host),
    // Block replacements must reach EditorView.decorations through a direct
    // StateField. ViewPlugin decoration getters run after viewport/height-map
    // computation and therefore corrupt vertical layout for block widgets.
    provide: (field) => EditorView.decorations.from(field),
  });
}
