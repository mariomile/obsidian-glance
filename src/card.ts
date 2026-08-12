import { createActions, createInlineEditor, createLoadingActions } from './card-actions.ts';
import type { CardContext } from './card-context.ts';
import { createMarker } from './card-marker.ts';
import { domainLabel } from './link-source.ts';
import type { GlanceSettings, LinkMetadata } from './model.ts';
import type { MetadataStore } from './store.ts';

export interface CardHost {
  store: MetadataStore;
  settings: () => GlanceSettings;
}

function createSkeleton(container: HTMLElement, context: CardContext, host: CardHost): void {
  const compact = context.layout === 'compact';
  container.replaceChildren();
  container.className = `glance-card is-loading${compact ? ' is-compact' : ''}${
    context.marker === 'none' ? '' : ' is-listed'
  }`;
  container.setAttribute('aria-label', `Loading preview for ${domainLabel(context.line.url)}`);

  const media = document.createElement('div');
  media.className = 'glance-card__skeleton-media';
  const body = document.createElement('div');
  body.className = 'glance-card__body';
  for (const width of compact ? ['72%', '46%'] : ['72%', '92%', '46%']) {
    const line = document.createElement('div');
    line.className = 'glance-card__skeleton-line';
    line.style.width = width;
    body.append(line);
  }
  // The slot is reserved while loading too, so the card does not shift
  // sideways when metadata lands.
  const marker = createMarker(context, toggleHandler(context));
  if (marker) container.append(marker);
  container.append(body, media, createLoadingActions(context, host));
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

/** Reading mode has no writer, which is what leaves its checkbox inert — the
 *  native one Obsidian rendered is still there and still works. */
function toggleHandler(context: CardContext): ((checked: boolean) => void) | undefined {
  const writer = context.write;
  if (!writer) return undefined;
  return (checked) => writer.setChecked(checked);
}

function createImage(metadata: LinkMetadata): HTMLElement {
  const media = document.createElement('div');
  media.className = 'glance-card__media';
  const image = document.createElement('img');
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

function renderMetadata(
  container: HTMLElement,
  metadata: LinkMetadata,
  host: CardHost,
  context: CardContext,
): void {
  const compact = context.layout === 'compact';
  // Only the skeleton-to-content swap is choreographed. A re-render from a
  // checkbox tick or a manual refresh keeps the card still — replaying the
  // entrance on every interaction would read as a glitch, not as polish.
  const settling = container.classList.contains('is-loading');
  container.replaceChildren();
  container.className = `glance-card${metadata.degraded ? ' is-degraded' : ''}${
    compact ? ' is-compact' : ''
  }${context.marker === 'none' ? '' : ' is-listed'}${
    context.marker === 'task' && context.line.checked ? ' is-task-checked' : ''
  }${settling ? ' is-settling' : ''}`;
  container.setAttribute('aria-label', metadata.title);

  const body = document.createElement('div');
  body.className = 'glance-card__body';

  const title = document.createElement('div');
  title.className = 'glance-card__title';
  title.textContent = metadata.title;
  body.append(title);

  // Compact is one line tall by definition, so the description is dropped
  // rather than clamped — the footer carries the provenance instead.
  if (!compact && host.settings().showDescription && metadata.description) {
    const description = document.createElement('div');
    description.className = 'glance-card__description';
    description.textContent = metadata.description;
    body.append(description);
  }

  const footer = document.createElement('div');
  footer.className = 'glance-card__footer';
  if (metadata.favicon) {
    const favicon = document.createElement('img');
    favicon.className = 'glance-card__favicon';
    favicon.src = metadata.favicon;
    favicon.alt = '';
    favicon.loading = 'lazy';
    favicon.addEventListener('error', () => favicon.remove(), { once: true });
    footer.append(favicon);
  }
  const site = document.createElement('span');
  site.className = 'glance-card__site';
  site.textContent = metadata.author ? `${metadata.siteName} · ${metadata.author}` : metadata.siteName;
  footer.append(site);
  body.append(footer);

  const link = document.createElement('a');
  link.className = 'glance-card__link';
  link.href = context.line.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open ${metadata.title}`);

  // DOM order is visual order: body, then media. The stylesheet no longer
  // reorders them with `order`.
  const media = host.settings().showThumbnail && metadata.image ? createImage(metadata) : null;
  const marker = createMarker(context, toggleHandler(context));
  if (marker) container.append(marker);
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
  container.className = `glance-card glance-card--embed${
    context.marker === 'none' ? '' : ' is-listed'
  }`;
  container.setAttribute('aria-label', `Embedded page: ${domainLabel(context.line.url)}`);

  const header = document.createElement('div');
  header.className = 'glance-card__embed-header';
  const site = document.createElement('span');
  site.className = 'glance-card__site';
  site.textContent = domainLabel(context.line.url);
  header.append(site);
  const open = document.createElement('a');
  open.className = 'glance-card__embed-open';
  open.href = context.line.url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'Open in browser';
  header.append(open);

  const frame = document.createElement('iframe');
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

  const marker = createMarker(context, toggleHandler(context));
  if (marker) container.append(marker);
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
  const card = document.createElement('div');
  wrapper.append(card);

  // An embed shows the live page, not an unfurled preview, so it never needs
  // the metadata store.
  if (context.layout === 'embed') {
    renderEmbed(card, context, host);
    return () => {};
  }

  const { url, label } = context.line;
  const current = host.store.get(url);
  if (current) renderMetadata(card, current, host, context);
  else createSkeleton(card, context, host);

  const unsubscribe = host.store.subscribe(url, (metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, context);
  });
  void host.store.ensure(url, label).then((metadata) => {
    if (card.isConnected) renderMetadata(card, metadata, host, context);
  });
  return unsubscribe;
}
