import { MarkdownView, Notice, Plugin } from 'obsidian';

import { glanceEditorExtension, refreshGlanceEffect } from './editor.ts';
import { parseGlanceLine } from './link-source.ts';
import { fetchLinkMetadata } from './metadata.ts';
import {
  DEFAULT_SETTINGS,
  type GlanceSettings,
  type PersistedGlanceData,
} from './model.ts';
import { glanceReadingProcessor } from './reading.ts';
import { GlanceSettingTab } from './settings.ts';
import { MetadataStore } from './store.ts';

export default class GlancePlugin extends Plugin {
  settings!: GlanceSettings;
  store!: MetadataStore;
  private persistedCache: PersistedGlanceData['cache'] = {};
  private saveTimer: number | null = null;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as PersistedGlanceData | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    this.persistedCache = data?.cache ?? {};

    this.store = new MetadataStore({
      initial: this.persistedCache,
      ttlMs: () => this.settings.cacheTtlHours * 60 * 60 * 1000,
      maxEntries: () => this.settings.maxCacheEntries,
      fetcher: fetchLinkMetadata,
      persist: (cache) => {
        this.persistedCache = cache;
        this.scheduleSave();
      },
    });

    const host = {
      store: this.store,
      settings: () => this.settings,
    };
    this.registerEditorExtension(glanceEditorExtension(host));
    this.registerMarkdownPostProcessor(glanceReadingProcessor(host));
    this.addSettingTab(new GlanceSettingTab(this.app, this));

    this.addCommand({
      id: 'refresh-card-under-cursor',
      name: 'Refresh card under cursor',
      editorCallback: (editor) => {
        const source = parseGlanceLine(editor.getLine(editor.getCursor().line));
        if (!source) {
          new Notice('Glance: place the cursor on a standalone web link');
          return;
        }
        void this.store.refresh(source.url, source.label).then(() => {
          new Notice('Glance preview refreshed');
          this.refreshEditors();
        });
      },
    });

    this.addCommand({
      id: 'clear-metadata-cache',
      name: 'Clear metadata cache',
      callback: () => {
        this.store.clear();
        this.refreshEditors();
        new Notice('Glance metadata cache cleared');
      },
    });
  }

  async savePluginData(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      cache: this.persistedCache,
    } satisfies PersistedGlanceData);
  }

  refreshEditors(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const cm = (leaf.view.editor as unknown as {
        cm?: { dispatch: (spec: unknown) => void };
      }).cm;
      cm?.dispatch({ effects: refreshGlanceEffect.of(null) });
    });
  }

  onunload(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.savePluginData();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.savePluginData();
    }, 500);
  }
}
