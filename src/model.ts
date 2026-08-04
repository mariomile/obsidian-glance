export interface LinkSource {
  url: string;
  label?: string;
}

export type CardLayout = 'expanded' | 'compact';

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

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName: string;
  author?: string;
  fetchedAt: number;
  degraded: boolean;
}

export interface GlanceSettings {
  showDescription: boolean;
  showThumbnail: boolean;
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
  cacheTtlHours: 168,
  maxCacheEntries: 400,
};
