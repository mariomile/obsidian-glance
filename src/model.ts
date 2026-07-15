export interface LinkSource {
  url: string;
  label?: string;
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
