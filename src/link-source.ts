import type { CardLayout, GlanceLine, LinkSource, ListKind } from './model.ts';

/**
 * Splits a line into three verbatim slices: everything before the link, the
 * link itself, and everything after it. Group 2 is the list marker, group 3
 * the task checkbox character, group 5 the layout marker keyword.
 *
 * The lazy `(.*?)` for the link grows only until the trailing group can reach
 * the end of the line, so trailing whitespace and the layout marker always
 * land in the suffix rather than in the link text.
 */
const LINE = new RegExp(
  '^(' +
    '[ \\t]*' +
    '(?:([-*+]|\\d{1,9}[.)])[ \\t]+' +
      '(?:\\[([ xX])\\][ \\t]+)?' +
    ')?' +
  ')' +
  '(.*?)' +
  '((?:[ \\t]+%%glance:(compact|expand)%%)?[ \\t]*)$',
  'i',
);

const RAW_URL = /^(https?:\/\/[^\s<>]+)$/i;
const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^\s)]+)(?:[ \t]+["'][^"']*["'])?\)$/i;

function parseLink(text: string): LinkSource | null {
  const markdown = MARKDOWN_LINK.exec(text);
  if (markdown?.[1] && markdown[2] && isSafeWebUrl(markdown[2])) {
    return { url: markdown[2], label: markdown[1] };
  }

  const raw = RAW_URL.exec(text);
  if (raw?.[1] && isSafeWebUrl(raw[1])) return { url: raw[1] };
  return null;
}

function indentLevelOf(prefix: string): number {
  const whitespace = /^[ \t]*/.exec(prefix)?.[0] ?? '';
  let tabs = 0;
  let spaces = 0;
  for (const character of whitespace) {
    if (character === '\t') tabs += 1;
    else spaces += 1;
  }
  // Obsidian nests a list item at two spaces minimum, so a space pair is one
  // level. Tabs are one level each, whatever the editor's tab width.
  return tabs + Math.floor(spaces / 2);
}

function listKindOf(marker: string | undefined, taskBox: string | undefined): ListKind {
  if (!marker) return 'none';
  if (taskBox !== undefined) return 'task';
  return /^\d/.test(marker) ? 'ordered' : 'bullet';
}

export function parseGlanceLine(text: string): GlanceLine | null {
  const match = LINE.exec(text);
  if (!match) return null;

  const [, prefix = '', listMarker, taskBox, linkText = '', suffix = '', layoutWord] = match;
  const source = parseLink(linkText);
  if (!source) return null;

  const list = listKindOf(listMarker, taskBox);
  const layout: CardLayout | undefined = layoutWord
    ? (layoutWord.toLowerCase() === 'compact' ? 'compact' : 'expanded')
    : undefined;

  return {
    ...source,
    prefix,
    linkText,
    suffix,
    indentLevel: indentLevelOf(prefix),
    list,
    ...(list === 'task' ? { checked: taskBox?.toLowerCase() === 'x' } : {}),
    ...(layout ? { layout } : {}),
  };
}

export function serializeGlanceLine(line: GlanceLine): string {
  return `${line.prefix}${line.linkText}${line.suffix}`;
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
