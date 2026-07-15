import assert from 'node:assert/strict';
import test from 'node:test';

import type { LinkMetadata } from './model.ts';
import { MetadataStore } from './store.ts';

function metadata(url: string): LinkMetadata {
  return {
    url,
    title: 'Example',
    siteName: 'example.com',
    fetchedAt: Date.now(),
    degraded: false,
  };
}

test('deduplicates concurrent metadata requests and persists the result', async () => {
  let fetches = 0;
  let persisted: Record<string, LinkMetadata> = {};
  const store = new MetadataStore({
    initial: {},
    ttlMs: () => 60_000,
    maxEntries: () => 100,
    fetcher: async (url) => {
      fetches += 1;
      await Promise.resolve();
      return metadata(url);
    },
    persist: (entries) => {
      persisted = entries;
    },
  });

  const [first, second] = await Promise.all([
    store.ensure('https://example.com'),
    store.ensure('https://example.com'),
  ]);

  assert.equal(fetches, 1);
  assert.equal(first, second);
  assert.equal(persisted['https://example.com']?.title, 'Example');
});

test('uses fresh cache entries and refresh bypasses them', async () => {
  const url = 'https://example.com';
  let fetches = 0;
  const store = new MetadataStore({
    initial: { [url]: metadata(url) },
    ttlMs: () => 60_000,
    maxEntries: () => 100,
    fetcher: async (target) => {
      fetches += 1;
      return { ...metadata(target), title: 'Refreshed' };
    },
    persist: () => undefined,
  });

  assert.equal((await store.ensure(url)).title, 'Example');
  assert.equal(fetches, 0);
  assert.equal((await store.refresh(url)).title, 'Refreshed');
  assert.equal(fetches, 1);
});
