import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';

import type GlancePlugin from './main.ts';
import type { CardLayout } from './model.ts';

export class GlanceSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GlancePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Glance' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Standalone links stay ordinary Markdown and render as rich cards when their line is inactive.',
    });

    new Setting(containerEl)
      .setName('Show descriptions')
      .setDesc('Display the page description below the card title when available.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showDescription)
        .onChange(async (value) => {
          this.plugin.settings.showDescription = value;
          await this.plugin.savePluginData();
          this.plugin.refreshEditors();
        }));

    new Setting(containerEl)
      .setName('Show thumbnails')
      .setDesc('Display Open Graph images when available.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showThumbnail)
        .onChange(async (value) => {
          this.plugin.settings.showThumbnail = value;
          await this.plugin.savePluginData();
          this.plugin.refreshEditors();
        }));

    new Setting(containerEl)
      .setName('Default card size')
      .setDesc('Override a single line with %%glance:compact%% or %%glance:expand%%.')
      .addDropdown((dropdown) => dropdown
        .addOption('expanded', 'Expanded')
        .addOption('compact', 'Compact')
        .setValue(this.plugin.settings.defaultCardLayout)
        .onChange(async (value) => {
          this.plugin.settings.defaultCardLayout = value as CardLayout;
          await this.plugin.savePluginData();
          this.plugin.refreshEditors();
        }));

    new Setting(containerEl)
      .setName('Cache lifetime')
      .setDesc(`${this.plugin.settings.cacheTtlHours} hours before metadata is refreshed.`)
      .addSlider((slider) => slider
        .setLimits(1, 720, 1)
        .setDynamicTooltip()
        .setValue(this.plugin.settings.cacheTtlHours)
        .onChange(async (value) => {
          this.plugin.settings.cacheTtlHours = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('Clear metadata cache')
      .setDesc('Remove all saved previews. Cards fetch their metadata again when rendered.')
      .addButton((button) => button
        .setButtonText('Clear cache')
        .onClick(() => {
          this.plugin.store.clear();
          this.plugin.refreshEditors();
          new Notice('Glance metadata cache cleared');
        }));
  }
}
