export interface LinkSource {
  url: string;
  label?: string;
}

export type CardLayout = 'expanded' | 'compact' | 'embed';

export type ListKind = 'none' | 'bullet' | 'ordered' | 'task';

/**
 * A parsed link line, stored as verbatim slices rather than reconstructed
 * fields: `prefix + linkText + suffix` is always exactly the original line.
 * Writes mutate one slice and leave the rest byte-identical, so a checkbox
 * click can never reformat spacing or drop a Markdown link title.
 */
export interface GlanceLine extends LinkSource {
  /** Everything before the link: indent, list marker, task box, gaps. */
  prefix: string;
  /** The link exactly as written. */
  linkText: string;
  /** Everything after the link: the layout marker and trailing whitespace. */
  suffix: string;
  /** Nesting level: tab count plus half the space count, floored. */
  indentLevel: number;
  list: ListKind;
  /** Present only when `list === 'task'`. */
  checked?: boolean;
  /** Set only by an explicit marker; otherwise the setting decides. */
  layout?: CardLayout;
}

export interface XPostMedia {
  type: 'photo' | 'video' | 'gif';
  /** A still image: the photo itself, or the video's poster frame. */
  thumbnail: string;
}

/** An X post read from its own data rather than from the page's Open Graph
 *  tags, which carry neither the full text nor the media. */
export interface XPost {
  authorName: string;
  handle: string;
  avatar?: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  media: XPostMedia[];
  likes?: number;
  replies?: number;
  reposts?: number;
}

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName: string;
  author?: string;
  /** Present only for X posts resolved through their post data. */
  post?: XPost;
  fetchedAt: number;
  degraded: boolean;
}

export interface GlanceSettings {
  showDescription: boolean;
  showThumbnail: boolean;
  defaultCardLayout: CardLayout;
  cacheTtlHours: number;
  maxCacheEntries: number;
}

export interface PersistedGlanceData {
  settings?: Partial<GlanceSettings>;
  cache?: Record<string, LinkMetadata>;
}

export const DEFAULT_SETTINGS: GlanceSettings = {
  showDescription: true,
  showThumbnail: true,
  defaultCardLayout: 'expanded',
  cacheTtlHours: 168,
  maxCacheEntries: 400,
};
