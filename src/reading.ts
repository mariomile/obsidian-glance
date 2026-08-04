import {
  MarkdownRenderChild,
  type MarkdownPostProcessor,
  type MarkdownPostProcessorContext,
} from 'obsidian';

import { mountCard, type CardHost } from './card.ts';
import { resolveLayout, type CardContext } from './card-context.ts';
import { parseGlanceLine } from './link-source.ts';
import type { GlanceLine } from './model.ts';

/** Obsidian's own list chrome, which sits beside the anchor inside an <li>:
 *  the bullet glyph span and the task checkbox. Neither is content, and
 *  counting either as a sibling is what kept bullet items from ever becoming
 *  cards in Reading mode. */
function isListChrome(node: Node): boolean {
  if (node instanceof HTMLInputElement) return true;
  return node instanceof HTMLElement && node.hasClass('list-bullet');
}

function onlyExternalAnchor(container: HTMLElement): HTMLAnchorElement | null {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>(':scope > a'));
  if (anchors.length !== 1) return null;
  const anchor = anchors[0];
  if (!anchor || !/^https?:\/\//i.test(anchor.href)) return null;

  const hasOtherContent = Array.from(container.childNodes).some((node) => {
    if (node === anchor || isListChrome(node)) return false;
    return (node.textContent ?? '').trim().length > 0;
  });
  return hasOtherContent ? null : anchor;
}

/**
 * The parsed source lines of this section.
 *
 * Obsidian strips `%%…%%` comments before the post-processor sees the DOM, so
 * the layout marker never reaches it. `getSectionInfo` hands back the whole
 * file with the section's line range, which is where the marker still lives.
 */
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

class ReadingCardMount extends MarkdownRenderChild {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly context: CardContext,
    private readonly host: CardHost,
  ) {
    super(element);
  }

  onload(): void {
    this.unsubscribe = mountCard(this.element, this.context, this.host);
  }

  onunload(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

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

export function glanceReadingProcessor(host: CardHost): MarkdownPostProcessor {
  return (element, context) => {
    // Parsed once per section, then consumed in document order, so a URL that
    // appears twice in one section still maps to its own line and its own
    // marker.
    const candidates = sectionLines(element, context);
    const takeLine = (url: string): GlanceLine | undefined => {
      const index = candidates.findIndex((line) => line.url === url);
      return index === -1 ? undefined : candidates.splice(index, 1)[0];
    };

    // Loose list items (`- link` separated by blank lines) render as
    // <li><p><a/></p></li>, so the paragraph pass covers them too.
    const paragraphs = [
      ...(element.matches('p') ? [element as HTMLParagraphElement] : []),
      ...Array.from(element.querySelectorAll<HTMLParagraphElement>('p')),
    ];
    for (const paragraph of paragraphs) {
      if (paragraph.closest('.glance-card')) continue;
      const anchor = onlyExternalAnchor(paragraph);
      if (!anchor) continue;

      const { card, mount } = mountFor(anchor, host, takeLine(anchor.href));
      paragraph.replaceWith(card);
      context.addChild(mount);
    }

    // Tight list items render as <li><a/></li>: keep the list structure (and
    // its bullet marker) and swap only the anchor for the card. Task items are
    // included — their native checkbox stays put and keeps working — but items
    // with nested lists are left untouched.
    for (const item of Array.from(element.querySelectorAll<HTMLLIElement>('li'))) {
      if (item.closest('.glance-card')) continue;
      if (item.querySelector('ul, ol, .glance-reading-card')) continue;
      const anchor = onlyExternalAnchor(item);
      if (!anchor) continue;

      const { card, mount } = mountFor(anchor, host, takeLine(anchor.href));
      anchor.replaceWith(card);
      context.addChild(mount);
    }
  };
}
