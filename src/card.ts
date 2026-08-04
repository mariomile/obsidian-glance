import { setIcon } from 'obsidian';

import { domainLabel } from './link-source.ts';
import type { GlanceSettings, LinkMetadata, LinkSource } from './model.ts';
import type { MetadataStore } from './store.ts';

export interface CardHost {
  store: MetadataStore;
  settings: () => GlanceSettings;
}

function createSkeleton(container: HTMLElement, source: LinkSource): void {
  container.replaceChildren();
  container.className = 'glance-card is-loading';
  container.setAttribute('aria-label', `Loading preview for ${domainLabel(source.url)}`);

  const media = document.createElement('div');
  media.className = 'glance-card__skeleton-media';
  const body = document.createElement('div');
  body.className = 'glance-card__body';
  for (const width of ['72%', '92%', '46%']) {
    const line = document.createElement('div');
    line.className = 'glance-card__skeleton-line';
    line.style.width = width;
    body.append(line);
  }
  container.append(media, body);
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
  source: LinkSource,
): void {
  container.replaceChildren();
  container.className = `glance-card${metadata.degraded ? ' is-degraded' : ''}`;
  container.setAttribute('aria-label', metadata.title);

  if (host.settings().showThumbnail && metadata.image) {
    container.append(createImage(metadata));
  }

  const body = document.createElement('div');
  body.className = 'glance-card__body';

  const title = document.createElement('div');
  title.className = 'glance-card__title';
  title.textContent = metadata.title;
  body.append(title);

  if (host.settings().showDescription && metadata.description) {
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

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'glance-card__copy clickable-icon';
  copy.setAttribute('aria-label', 'Copy link');
  setIcon(copy, 'copy');
  let copyResetHandle: number | undefined;
  copy.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard.writeText(source.url).then(() => {
      copy.addClass('is-copied');
      setIcon(copy, 'check');
      window.clearTimeout(copyResetHandle);
      copyResetHandle = window.setTimeout(() => {
        copy.removeClass('is-copied');
        setIcon(copy, 'copy');
      }, 1200);
    });
  });

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'glance-card__refresh clickable-icon';
  refresh.setAttribute('aria-label', 'Refresh link preview');
  setIcon(refresh, 'refresh-cw');
  refresh.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    refresh.addClass('is-spinning');
    void host.store.refresh(source.url, source.label).finally(() => {
      refresh.removeClass('is-spinning');
    });
  });

  const link = document.createElement('a');
  link.className = 'glance-card__link';
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open ${metadata.title}`);

  container.append(body, copy, refresh, link);
}

export function mountCard(wrapper: HTMLElement, source: LinkSource, host: CardHost): () => void {
  // The card is a child element this module owns outright. The wrapper belongs
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
