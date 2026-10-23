import type { LinkMetadata, XPost, XPostMedia } from './model.ts';

/**
 * X posts, read from FixTweet's public API (api.fxtwitter.com) instead of the
 * page: x.com serves no useful Open Graph tags and refuses to be framed, so
 * neither the generic card nor the embed layout can show a post's text.
 *
 * Pure on purpose, like card-context.ts: the fetch itself lives in
 * metadata.ts, the only module allowed to import `obsidian`.
 */

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com']);

export interface XStatus {
  /** Absent for `/i/web/status/<id>` links. */
  handle?: string;
  id: string;
}

export function xStatusOf(value: string): XStatus | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!X_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ''))) return null;

  const web = /^\/i\/web\/status\/(\d+)/.exec(url.pathname);
  if (web?.[1]) return { id: web[1] };
  const status = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d+)/.exec(url.pathname);
  if (status?.[1] && status[2]) return { handle: status[1], id: status[2] };
  return null;
}

/** The API answers any handle for a given id, so `i` stands in when the link
 *  carried none. */
export function xApiUrl(status: XStatus): string {
  return `https://api.fxtwitter.com/${status.handle ?? 'i'}/status/${status.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mediaOf(value: unknown): XPostMedia[] {
  if (!isRecord(value) || !Array.isArray(value.all)) return [];
  const media: XPostMedia[] = [];
  for (const item of value.all) {
    if (!isRecord(item)) continue;
    const type = item.type === 'photo' || item.type === 'video' || item.type === 'gif'
      ? item.type
      : undefined;
    const thumbnail = type === 'photo' ? str(item.url) : str(item.thumbnail_url);
    if (type && thumbnail?.startsWith('https://')) media.push({ type, thumbnail });
  }
  return media;
}

/** Maps the API response onto the card's metadata. Null when the body is not
 *  a post (deleted, private, or an error page), so the caller can fall back
 *  to the page's own tags. */
export function xPostMetadata(body: unknown, url: string, now = Date.now()): LinkMetadata | null {
  if (!isRecord(body) || !isRecord(body.tweet)) return null;
  const tweet = body.tweet;
  const author = isRecord(tweet.author) ? tweet.author : {};
  const handle = str(author.screen_name);
  const text = typeof tweet.text === 'string' ? tweet.text : undefined;
  if (!handle || text === undefined) return null;

  const authorName = str(author.name) ?? handle;
  const avatar = str(author.avatar_url);
  const seconds = num(tweet.created_timestamp);
  const likes = num(tweet.likes);
  const replies = num(tweet.replies);
  const reposts = num(tweet.retweets);
  const post: XPost = {
    authorName,
    handle,
    ...(avatar?.startsWith('https://') ? { avatar } : {}),
    text,
    createdAt: seconds === undefined ? now : seconds * 1000,
    media: mediaOf(tweet.media),
    ...(likes === undefined ? {} : { likes }),
    ...(replies === undefined ? {} : { replies }),
    ...(reposts === undefined ? {} : { reposts }),
  };

  const description = text.replace(/\s+/g, ' ').trim();
  const image = post.media[0]?.thumbnail;
  return {
    url,
    title: `${authorName} (@${handle})`,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
    siteName: 'x.com',
    post,
    fetchedAt: now,
    degraded: false,
  };
}
