import type { LinkSource } from './model.ts';

// An optional list marker (`- `, `* `, `+ `, `1. `, `1) `) may precede the
// link so bullet items render cards too. Task markers (`- [ ]`) are left
// alone: hiding a checkbox behind a card would make the task uncheckable.
const LIST_PREFIX = String.raw`\s*(?:(?:[-*+]|\d{1,9}[.)])\s+)?`;
const RAW_URL = new RegExp(`^${LIST_PREFIX}(https?:\\/\\/[^\\s<>]+)\\s*$`, 'i');
const MARKDOWN_LINK = new RegExp(
  `^${LIST_PREFIX}\\[([^\\]]+)]\\((https?:\\/\\/[^\\s)]+)(?:\\s+["'][^"']*["'])?\\)\\s*$`,
  'i',
);

export function parseStandaloneLink(line: string): LinkSource | null {
  const markdown = MARKDOWN_LINK.exec(line);
  if (markdown?.[1] && markdown[2] && isSafeWebUrl(markdown[2])) {
    return { url: markdown[2], label: markdown[1] };
  }

  const raw = RAW_URL.exec(line);
  if (raw?.[1] && isSafeWebUrl(raw[1])) return { url: raw[1] };
  return null;
}

export function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function domainLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

export function resolveWebUrl(candidate: string | undefined, base: string): string | undefined {
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate, base);
    return isSafeWebUrl(url.href) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
