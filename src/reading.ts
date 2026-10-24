import {
  MarkdownRenderChild,
  type MarkdownPostProcessor,
  type MarkdownPostProcessorContext,
} from 'obsidian';

import { mountCard, type CardHost } from './card.ts';
import { resolveLayout, type CardContext } from './card-context.ts';
import { parseGlanceLine } from './link-source.ts';
import type { GlanceLine } from './model.ts';
import { xStatusOf } from './x-post.ts';

/** Obsidian's own list chrome, which sits beside the anchor inside an <li>:
 *  the bullet glyph span and the task checkbox. Neither is content, and
 *  counting either as a sibling is what kept bullet items from ever becoming
 *  cards in Reading mode. */
function isListChrome(node: Node): boolean {
  if (node.instanceOf(HTMLInputElement)) return true;
  return node.instanceOf(HTMLElement) &&
    (node.hasClass('list-bullet') || node.hasClass('list-collapse-indicator'));
}

/** An item's own sub-list. It belongs to the item, not to its line, so it
 *  stays where it is under the card. */
function isSubList(node: Node): boolean {
  return node.instanceOf(HTMLElement) && (node.tagName === 'UL' || node.tagName === 'OL');
}

function onlyExternalAnchor(container: HTMLElement): HTMLAnchorElement | null {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>(':scope > a'));
  if (anchors.length !== 1) return null;
  const anchor = anchors[0];
  if (!anchor || !/^https?:\/\//i.test(anchor.href)) return null;

  const hasOtherContent = Array.from(container.childNodes).some((node) => {
    if (node === anchor || isListChrome(node) || isSubList(node)) return false;
    return (node.textContent ?? '').trim().length > 0;
  });
  return hasOtherContent ? null : anchor;
}

/** The status id of an X embed as Obsidian renders it: an <img> pointing at
 *  the post, or the platform.twitter.com iframe it later swaps that for. */
function xEmbedId(node: Element): string | null {
  if (node.instanceOf(HTMLImageElement)) {
    return xStatusOf(node.getAttribute('src') ?? '')?.id ?? null;
  }
  if (node.instanceOf(HTMLIFrameElement)) {
    const src = node.getAttribute('src') ?? '';
    if (!src.startsWith('https://platform.twitter.com/embed/')) return null;
    return /[?&]id=(\d+)/.exec(src)?.[1] ?? null;
  }
  return null;
}

function isBlank(node: Node | null): boolean {
  return node !== null && node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim();
}

/** The nearest sibling that is not whitespace, in one direction. */
function neighbour(node: Node, forward: boolean): Node | null {
  let next = forward ? node.nextSibling : node.previousSibling;
  while (isBlank(next)) next = next && (forward ? next.nextSibling : next.previousSibling);
  return next;
}

function isLineEdge(node: Node | null): boolean {
  return node === null ||
    (node.instanceOf(HTMLElement) && node.tagName === 'BR') ||
    isListChrome(node) ||
    isSubList(node);
}

/** X embeds that stand alone on their own source line, the embed counterpart
 *  of onlyExternalAnchor. A paragraph joins consecutive lines with <br>, so
 *  an embed on its own line is one bounded by <br> or the block's edges. */
function lineXEmbeds(container: HTMLElement): { node: Element; id: string }[] {
  const found: { node: Element; id: string }[] = [];
  for (const node of Array.from(container.querySelectorAll(':scope > img, :scope > iframe'))) {
    const id = xEmbedId(node);
    if (!id) continue;
    if (isLineEdge(neighbour(node, false)) && isLineEdge(neighbour(node, true))) found.push({ node, id });
  }
  return found;
}

/** Removes the <br> that ended the line a card replaced: the card is a block,
 *  so the break would leave an empty line under it. */
function dropLineBreak(node: Element): void {
  const next = neighbour(node, true);
  if (next?.instanceOf(HTMLElement) && next.tagName === 'BR') next.remove();
}

function normalizedUrl(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
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

function anchorLabel(anchor: HTMLAnchorElement): string | undefined {
  const text = anchor.textContent?.trim();
  return text && text !== anchor.href ? text : undefined;
}

function mountFor(
  url: string,
  label: string | undefined,
  host: CardHost,
  sourceLine: GlanceLine | undefined,
): { card: HTMLElement; mount: ReadingCardMount } {
  const card = createDiv();
  card.className = 'glance-reading-card';
  const line: GlanceLine = sourceLine ?? {
    url,
    ...(label ? { label } : {}),
    prefix: '',
    linkText: url,
    suffix: '',
    indentLevel: 0,
    list: 'none',
  };
  const context: CardContext = {
    line,
    layout: resolveLayout(line, host.settings()),
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
    // The DOM hands back `anchor.href`, which the browser normalises
    // (`https://obsidian.md` becomes `https://obsidian.md/`), so both sides
    // are compared normalised or the line, its list kind and marker are lost.
    const takeLine = (url: string): GlanceLine | undefined => {
      const target = normalizedUrl(url);
      const index = candidates.findIndex((line) => normalizedUrl(line.url) === target);
      return index === -1 ? undefined : candidates.splice(index, 1)[0];
    };
    // An embed may already be the platform iframe, whose src no longer holds
    // the URL as written, so embeds are matched on the post id instead.
    const takeXLine = (id: string): GlanceLine | undefined => {
      const index = candidates.findIndex((line) => xStatusOf(line.url)?.id === id);
      return index === -1 ? undefined : candidates.splice(index, 1)[0];
    };
    const mountEmbeds = (container: HTMLElement): number => {
      const embeds = lineXEmbeds(container);
      for (const embed of embeds) {
        const sourceLine = takeXLine(embed.id);
        const url = sourceLine?.url ?? `https://x.com/i/web/status/${embed.id}`;
        const alt = embed.node.getAttribute('alt')?.trim();
        const { card, mount } = mountFor(url, alt || undefined, host, sourceLine);
        dropLineBreak(embed.node);
        embed.node.replaceWith(card);
        context.addChild(mount);
      }
      return embeds.length;
    };

    // Loose list items (`- link` separated by blank lines) render as
    // <li><p><a/></p></li>, so the paragraph pass covers them too.
    const paragraphs = [
      ...(element.matches('p') ? [element as HTMLParagraphElement] : []),
      ...Array.from(element.querySelectorAll<HTMLParagraphElement>('p')),
    ];
    for (const paragraph of paragraphs) {
      if (paragraph.closest('.glance-card')) continue;
      if (mountEmbeds(paragraph) > 0) {
        // A paragraph left holding only cards is unwrapped, so the cards keep
        // the block spacing a standalone link card gets.
        const onlyCards = Array.from(paragraph.childNodes)
          .every((node) => isBlank(node) || (node.instanceOf(HTMLElement) && node.hasClass('glance-reading-card')));
        if (onlyCards) paragraph.replaceWith(...Array.from(paragraph.children));
        continue;
      }
      const anchor = onlyExternalAnchor(paragraph);
      if (!anchor) continue;

      const { card, mount } = mountFor(anchor.href, anchorLabel(anchor), host, takeLine(anchor.href));
      paragraph.replaceWith(card);
      context.addChild(mount);
    }

    // Tight list items render as <li><a/></li>: keep the list structure (and
    // its bullet marker) and swap only the anchor for the card. Task items are
    // included, their native checkbox stays put and keeps working, and so are
    // items with sub-bullets: the card takes the item's line and the sub-list
    // stays under it, the way Live Preview draws the same lines.
    for (const item of Array.from(element.querySelectorAll<HTMLLIElement>('li'))) {
      if (item.closest('.glance-card')) continue;
      if (item.querySelector(':scope > .glance-reading-card')) continue;
      if (mountEmbeds(item) > 0) continue;
      const anchor = onlyExternalAnchor(item);
      if (!anchor) continue;

      const { card, mount } = mountFor(anchor.href, anchorLabel(anchor), host, takeLine(anchor.href));
      anchor.replaceWith(card);
      context.addChild(mount);
    }
  };
}
