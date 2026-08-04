import { createActions } from './card-actions.ts';
import type { CardContext } from './card-context.ts';
import { createMarker } from './card-marker.ts';
import { domainLabel } from './link-source.ts';
import type { GlanceSettings, LinkMetadata } from './model.ts';
import type { MetadataStore } from './store.ts';

export interface CardHost {
  store: MetadataStore;
  settings: () => GlanceSettings;
}

function createSkeleton(container: HTMLElement, context: CardContext): void {
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
  container.append(body, media);
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
  image.src = metadata.image ?? '';
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => media.remove(), { once: true });
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
  container.replaceChildren();
  container.className = `glance-card${metadata.degraded ? ' is-degraded' : ''}${
    compact ? ' is-compact' : ''
  }${context.marker === 'none' ? '' : ' is-listed'}${
    context.marker === 'task' && context.line.checked ? ' is-task-checked' : ''
  }`;
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
  container.append(createActions(context, host), link);
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
