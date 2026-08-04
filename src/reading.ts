import { MarkdownRenderChild, type MarkdownPostProcessor } from 'obsidian';

import { mountCard, type CardHost } from './card.ts';
import { resolveLayout, type CardContext } from './card-context.ts';
import type { GlanceLine } from './model.ts';

function onlyExternalAnchor(container: HTMLElement): HTMLAnchorElement | null {
  if (container.children.length !== 1) return null;
  const anchor = container.firstElementChild;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (!/^https?:\/\//i.test(anchor.href)) return null;
  const meaningfulText = Array.from(container.childNodes)
    .filter((node) => node !== anchor)
    .some((node) => (node.textContent ?? '').trim().length > 0);
  return meaningfulText ? null : anchor;
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

      const { card, mount } = mountFor(anchor, host);
      paragraph.replaceWith(card);
      context.addChild(mount);
    }

    // Tight list items render as <li><a/></li>: keep the list structure (and
    // its bullet marker) and swap only the anchor for the card. Task items
    // (checkbox inputs) and items with nested lists are left untouched.
    for (const item of Array.from(element.querySelectorAll<HTMLLIElement>('li'))) {
      if (item.closest('.glance-card')) continue;
      if (item.querySelector('ul, ol, input, .glance-reading-card')) continue;
      const anchor = onlyExternalAnchor(item);
      if (!anchor) continue;

      const { card, mount } = mountFor(anchor, host);
      anchor.replaceWith(card);
      context.addChild(mount);
    }
  };
}
