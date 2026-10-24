import type { EditorView } from '@codemirror/view';

import type { CardWriter } from './card-context.ts';
import { isSafeWebUrl, parseGlanceLine, serializeGlanceLine } from './link-source.ts';
import type { CardLayout, GlanceLine } from './model.ts';
import { xStatusOf } from './x-post.ts';

/**
 * The only module in this plugin that mutates the document.
 *
 * The three `with*` functions are pure transforms over the verbatim slices, so
 * a write touches one slice and leaves the rest byte-identical: a checkbox
 * click can never reformat spacing or drop a Markdown link title. `bindWriter`
 * is the sole holder of `view.dispatch({changes})`, which is what keeps
 * editor.ts free of `changes:` and the decoration pipeline pure — the
 * invariant behind README's source-pure promise, guarded by
 * editor-safety.test.ts.
 */

const LAYOUT_MARKER: Record<CardLayout, string> = {
  compact: 'compact',
  expanded: 'expand',
  embed: 'embed',
};

export function withLayout(line: GlanceLine, layout: CardLayout | undefined): GlanceLine {
  const next: GlanceLine = {
    ...line,
    suffix: layout ? ` %%glance:${LAYOUT_MARKER[layout]}%%` : '',
  };
  if (layout) next.layout = layout;
  else delete next.layout;
  return next;
}

export function withLink(line: GlanceLine, url: string): GlanceLine {
  const trimmed = url.trim();
  if (!isSafeWebUrl(trimmed)) return line;
  // An X embed stays an embed only while it still points at a post: the same
  // syntax around any other URL is an image, which Glance does not render.
  if (line.linkText.startsWith('!') && xStatusOf(trimmed)) {
    return { ...line, url: trimmed, linkText: `![${line.label ?? ''}](${trimmed})` };
  }
  return {
    ...line,
    url: trimmed,
    linkText: line.label ? `[${line.label}](${trimmed})` : trimmed,
  };
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
  };
}
