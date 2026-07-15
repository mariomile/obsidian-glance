import type { LinkMetadata } from './model.ts';

type Subscriber = (metadata: LinkMetadata) => void;

const DEGRADED_TTL_MS = 15 * 60 * 1000;

export interface MetadataStoreOptions {
  initial: Record<string, LinkMetadata>;
  ttlMs: () => number;
  maxEntries: () => number;
  fetcher: (url: string, label?: string) => Promise<LinkMetadata>;
  persist: (entries: Record<string, LinkMetadata>) => void;
}

export class MetadataStore {
  private readonly cache = new Map<string, LinkMetadata>();
  private readonly pending = new Map<string, Promise<LinkMetadata>>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly options: MetadataStoreOptions;

  constructor(options: MetadataStoreOptions) {
    this.options = options;
    for (const [url, metadata] of Object.entries(options.initial)) {
      this.cache.set(url, metadata);
    }
    this.prune();
  }

  get(url: string): LinkMetadata | undefined {
    return this.cache.get(url);
  }

  isFresh(metadata: LinkMetadata): boolean {
    // Degraded entries (timeouts, blocked fetches) expire quickly so the site
    // gets retried instead of staying title-less for the whole cache TTL.
    const ttl = metadata.degraded
      ? Math.min(this.options.ttlMs(), DEGRADED_TTL_MS)
      : this.options.ttlMs();
    return Date.now() - metadata.fetchedAt < ttl;
  }

  async ensure(url: string, label?: string, force = false): Promise<LinkMetadata> {
    const cached = this.cache.get(url);
    if (!force && cached && this.isFresh(cached)) return cached;

    const existing = this.pending.get(url);
    if (existing) return existing;

    const request = this.options.fetcher(url, label).then((metadata) => {
      this.cache.delete(url);
      this.cache.set(url, metadata);
      this.prune();
      this.emit(url, metadata);
      this.options.persist(this.toJSON());
      return metadata;
    }).finally(() => {
      this.pending.delete(url);
    });
    this.pending.set(url, request);
    return request;
  }

  async refresh(url: string, label?: string): Promise<LinkMetadata> {
    return this.ensure(url, label, true);
  }

  subscribe(url: string, subscriber: Subscriber): () => void {
    const listeners = this.subscribers.get(url) ?? new Set<Subscriber>();
    listeners.add(subscriber);
    this.subscribers.set(url, listeners);
    return () => {
      listeners.delete(subscriber);
      if (listeners.size === 0) this.subscribers.delete(url);
    };
  }

  clear(): void {
    this.cache.clear();
    this.options.persist({});
  }

  toJSON(): Record<string, LinkMetadata> {
    return Object.fromEntries(this.cache.entries());
  }

  private emit(url: string, metadata: LinkMetadata): void {
    for (const listener of this.subscribers.get(url) ?? []) listener(metadata);
  }

  private prune(): void {
    const maximum = Math.max(20, this.options.maxEntries());
    while (this.cache.size > maximum) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) return;
      this.cache.delete(oldest);
    }
  }
}
