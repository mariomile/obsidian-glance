import { requestUrl } from 'obsidian';

import { domainLabel, resolveWebUrl } from './link-source.ts';
import type { LinkMetadata } from './model.ts';

function metaContent(document: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const content = document.querySelector<HTMLMetaElement>(selector)?.content.trim();
    if (content) return content;
  }
  return undefined;
}

function firstIcon(document: Document): string | undefined {
  return document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  )?.getAttribute('href') ?? undefined;
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export function fallbackMetadata(url: string, label?: string): LinkMetadata {
  const siteName = domainLabel(url);
  return {
    url,
    title: label?.trim() || siteName,
    siteName,
    favicon: resolveWebUrl('/favicon.ico', url),
    fetchedAt: Date.now(),
    degraded: true,
  };
}

/** `requestUrl` has no timeout: a hanging host would pin the card on its
 *  skeleton indefinitely. Resolve with the degraded fallback instead — the
 *  store keeps degraded entries on a short TTL, so the site is retried soon. */
const FETCH_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), FETCH_TIMEOUT_MS);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      () => { window.clearTimeout(timer); resolve(fallback); },
    );
  });
}

export async function fetchLinkMetadata(url: string, label?: string): Promise<LinkMetadata> {
  const fallback = fallbackMetadata(url, label);
  try {
    const response = await withTimeout(requestUrl({
      url,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
      throw: false,
    }), null);
    if (response === null) return fallback;
    if (response.status < 200 || response.status >= 400 || !response.text) return fallback;

    const document = new DOMParser().parseFromString(response.text, 'text/html');
    const title = cleanText(
      metaContent(
        document,
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ) ?? document.title,
    );
    const description = cleanText(
      metaContent(
        document,
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]',
      ),
    );
    const image = resolveWebUrl(
      metaContent(
        document,
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ),
      url,
    );
    const favicon = resolveWebUrl(firstIcon(document), url) ?? fallback.favicon;
    const siteName = cleanText(metaContent(document, 'meta[property="og:site_name"]')) ?? fallback.siteName;
    const author = cleanText(
      metaContent(
        document,
        'meta[name="author"]',
        'meta[property="article:author"]',
      ),
    );

    return {
      url,
      title: title ?? fallback.title,
      description,
      image,
      favicon,
      siteName,
      author,
      fetchedAt: Date.now(),
      degraded: !title,
    };
  } catch {
    return fallback;
  }
}
