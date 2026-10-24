import { setIcon } from 'obsidian';

import { createActions, createInlineEditor } from './card-actions.ts';
import type { CardContext } from './card-context.ts';
import { domainLabel } from './link-source.ts';
import { fallbackMetadata } from './metadata.ts';
import type { GlanceSettings, LinkMetadata, XPost } from './model.ts';
import type { MetadataStore } from './store.ts';
import { xStatusOf } from './x-post.ts';

export interface CardHost {
  store: MetadataStore;
  settings: () => GlanceSettings;
}

/** Opens the inline editor at the top of the card body. Undefined without a
 *  writer, which is what leaves Reading mode without an edit button. */
function startEdit(context: CardContext, body: HTMLElement): (() => void) | undefined {
  const writer = context.write;
  if (!writer) return undefined;

  return () => {
    if (body.querySelector('.glance-card__edit')) return;
    const input: HTMLInputElement = createInlineEditor(
      context.line.url,
      (url) => {
        input.remove();
        context.onEditEnd?.();
        writer.setLink(url);
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
  };
}

function createImage(metadata: LinkMetadata): HTMLElement {
  const media = createDiv();
  media.className = 'glance-card__media';
  const image = createEl('img');
  image.className = 'glance-card__image';
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  // Both listeners are attached before `src`, so a already-cached image cannot
  // resolve in the gap and leave the element stuck at its starting opacity.
  image.addEventListener('load', () => image.classList.add('is-loaded'), { once: true });
  image.addEventListener('error', () => media.remove(), { once: true });
  image.src = metadata.image ?? '';
  media.append(image);
  return media;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function postStats(post: XPost): string[] {
  const stats: string[] = [];
  if (post.replies) stats.push(`${formatCount(post.replies)} replies`);
  if (post.reposts) stats.push(`${formatCount(post.reposts)} reposts`);
  if (post.likes) stats.push(`${formatCount(post.likes)} likes`);
  return stats;
}

/** Up to four stills in the post's own order. A video shows its poster with a
 *  play glyph: the card opens the post, it does not play it. */
function createPostMedia(post: XPost): HTMLElement | null {
  const items = post.media.slice(0, 4);
  if (items.length === 0) return null;
  const grid = createDiv();
  grid.className = `glance-post__media is-count-${items.length}`;
  for (const item of items) {
    const cell = createDiv();
    cell.className = 'glance-post__still';
    const image = createEl('img');
    image.className = 'glance-card__image';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('load', () => image.classList.add('is-loaded'), { once: true });
    image.addEventListener('error', () => cell.remove(), { once: true });
    image.src = item.thumbnail;
    cell.append(image);
    if (item.type !== 'photo') {
      const play = createDiv();
      play.className = 'glance-post__play';
      setIcon(play, 'play');
      cell.append(play);
    }
    grid.append(cell);
  }
  return grid;
}

/**
 * An X post drawn from its own data: author, full text and media, instead of
 * the iframe Obsidian loads for `![](x.com/…)`. Column layout, because the
 * text is the payload and the media sits under it the way it does on X.
 */
function renderPost(
  container: HTMLElement,
  metadata: LinkMetadata,
  post: XPost,
  host: CardHost,
  context: CardContext,
): void {
  container.replaceChildren();
  container.className = `glance-card glance-card--post${
    context.line.list === 'task' && context.line.checked ? ' is-task-checked' : ''
  }`;
  container.setAttribute('aria-label', `${metadata.title}: ${post.text.slice(0, 80)}`);

  const body = createDiv();
  body.className = 'glance-card__body';

  const header = createDiv();
  header.className = 'glance-post__header';
  if (post.avatar) {
    const avatar = createEl('img');
    avatar.className = 'glance-post__avatar';
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.addEventListener('error', () => avatar.remove(), { once: true });
    avatar.src = post.avatar;
    header.append(avatar);
  }
  const who = createDiv();
  who.className = 'glance-post__who';
  const name = createSpan();
  name.className = 'glance-card__title glance-post__name';
  name.textContent = post.authorName;
  const meta = createSpan();
  meta.className = 'glance-post__meta';
  const date = new Date(post.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  meta.textContent = `@${post.handle} · ${date}`;
  who.append(name, meta);
  header.append(who);
  body.append(header);

  if (post.text.trim()) {
    const text = createDiv();
    text.className = 'glance-post__text';
    text.textContent = post.text;
    body.append(text);
  }

  const media = host.settings().showThumbnail ? createPostMedia(post) : null;
  if (media) body.append(media);

  const footer = createDiv();
  footer.className = 'glance-card__footer';
  if (metadata.favicon) {
    const favicon = createEl('img');
    favicon.className = 'glance-card__favicon';
    favicon.src = metadata.favicon;
    favicon.alt = '';
    favicon.loading = 'lazy';
    favicon.addEventListener('error', () => favicon.remove(), { once: true });
    footer.append(favicon);
  }
  const site = createSpan();
  site.className = 'glance-card__site';
  site.textContent = [metadata.siteName, ...postStats(post)].join(' · ');
  footer.append(site);
  body.append(footer);

  const link = createEl('a');
  link.className = 'glance-card__link';
  link.href = context.line.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open post by ${metadata.title}`);

  container.append(body, createActions(context, host, startEdit(context, body)), link);
}

/** A post as one row: what was said leads, who said it moves to the footer.
 *  "Jaynit (@jaynitx)" alone would say nothing about why the link is there. */
function compactPost(metadata: LinkMetadata, post: XPost): LinkMetadata {
  const firstLine = post.text.split('\n').map((line) => line.trim()).find(Boolean);
  return {
    ...metadata,
    title: firstLine ?? metadata.title,
    author: firstLine ? `${post.authorName} (@${post.handle})` : undefined,
  };
}

function renderMetadata(
  container: HTMLElement,
  source: LinkMetadata,
  host: CardHost,
  context: CardContext,
): void {
  const compact = context.layout === 'compact';
  if (source.post && !compact) {
    renderPost(container, source, source.post, host, context);
    return;
  }
  const metadata = source.post ? compactPost(source, source.post) : source;
  container.replaceChildren();
  container.className = `glance-card${metadata.degraded ? ' is-degraded' : ''}${
    compact ? ' is-compact' : ''
  }${context.line.list === 'task' && context.line.checked ? ' is-task-checked' : ''}`;
  container.setAttribute('aria-label', metadata.title);

  const body = createDiv();
  body.className = 'glance-card__body';

  const title = createDiv();
  title.className = 'glance-card__title';
  title.textContent = metadata.title;
  body.append(title);

  // Compact is one line tall by definition, so the description is dropped
  // rather than clamped — the footer carries the provenance instead.
  if (!compact && host.settings().showDescription && metadata.description) {
    const description = createDiv();
    description.className = 'glance-card__description';
    description.textContent = metadata.description;
    body.append(description);
  }

  const footer = createDiv();
  footer.className = 'glance-card__footer';
  if (metadata.favicon) {
    const favicon = createEl('img');
    favicon.className = 'glance-card__favicon';
    favicon.src = metadata.favicon;
    favicon.alt = '';
    favicon.loading = 'lazy';
    favicon.addEventListener('error', () => favicon.remove(), { once: true });
    footer.append(favicon);
  }
  const site = createSpan();
  site.className = 'glance-card__site';
  site.textContent = metadata.author ? `${metadata.siteName} · ${metadata.author}` : metadata.siteName;
  footer.append(site);
  body.append(footer);

  const link = createEl('a');
  link.className = 'glance-card__link';
  link.href = context.line.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open ${metadata.title}`);

  // DOM order is visual order: body, then media. The stylesheet no longer
  // reorders them with `order`.
  const media = host.settings().showThumbnail && metadata.image ? createImage(metadata) : null;
  container.append(body);
  if (media) container.append(media);
  container.append(createActions(context, host, startEdit(context, body)), link);
}

/**
 * The live page itself, not an unfurled preview — so unlike renderMetadata
 * this never waits on the metadata store. A header stays above the iframe
 * because many sites refuse to render inside one (`X-Frame-Options`/CSP) with
 * no reliable way to detect that from here: the "Open in browser" link is the
 * fallback, not error-detection logic.
 */
function renderEmbed(container: HTMLElement, context: CardContext, host: CardHost): void {
  container.replaceChildren();
  container.className = 'glance-card glance-card--embed';
  container.setAttribute('aria-label', `Embedded page: ${domainLabel(context.line.url)}`);

  const header = createDiv();
  header.className = 'glance-card__embed-header';
  const site = createSpan();
  site.className = 'glance-card__site';
  site.textContent = domainLabel(context.line.url);
  header.append(site);
  const open = createEl('a');
  open.className = 'glance-card__embed-open';
  open.href = context.line.url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'Open in browser';
  header.append(open);

  const frame = createEl('iframe');
  frame.className = 'glance-card__embed-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  // No allow-top-navigation: an embedded page must not be able to hijack the
  // whole Obsidian window.
  frame.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-forms');
  // Attached before `src` for the same reason as the thumbnail's: a frame that
  // resolves fast must not beat its own listener. Fires cross-origin too, so a
  // site that refuses to render still settles instead of hanging invisible.
  frame.addEventListener('load', () => frame.classList.add('is-loaded'), { once: true });
  frame.src = context.line.url;

  container.append(header, frame, createActions(context, host, undefined));
}

export function mountCard(
  wrapper: HTMLElement,
  context: CardContext,
  host: CardHost,
): () => void {
  // The card is a child element this module owns outright. The wrapper belongs
  // to the caller and carries its own layout class, which is why nothing here
  // ever touches the wrapper's class list.
  const card = createDiv();
  wrapper.append(card);

  // An embed shows the live page, not an unfurled preview, so it never needs
  // the metadata store. X refuses to be framed, so a post always gets its card.
  if (context.layout === 'embed' && !xStatusOf(context.line.url)) {
    renderEmbed(card, context, host);
    return () => {};
  }

  const { url, label } = context.line;
  let disposed = false;
  let rendered = host.store.get(url) ?? fallbackMetadata(url, label);
  renderMetadata(card, rendered, host, context);

  // Markdown renderers can prepare cards off-document before attaching them.
  // The mount lifetime, rather than DOM connectivity, owns metadata updates.
  const update = (metadata: LinkMetadata): void => {
    if (disposed || metadata === rendered) return;
    rendered = metadata;
    renderMetadata(card, metadata, host, context);
  };
  const unsubscribe = host.store.subscribe(url, update);
  void host.store.ensure(url, label).then(update);
  return () => {
    disposed = true;
    unsubscribe();
  };
}
