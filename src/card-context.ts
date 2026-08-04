import type { CardLayout, GlanceLine, GlanceSettings, ListKind } from './model.ts';

/**
 * Everything that varies per mounted card.
 *
 * This module holds no Obsidian import on purpose: `obsidian` is a types-only
 * package replaced by esbuild at build time, so any module importing it cannot
 * be loaded by the test runner. Keeping the context and its resolver here
 * makes them directly testable, and gives the card's sub-modules something to
 * import that does not point back at `card.ts`.
 */
export interface CardContext {
  line: GlanceLine;
  /** Already resolved against the setting. */
  layout: CardLayout;
  /**
   * The marker the card must draw itself. Reading mode passes 'none' because
   * Obsidian's own bullet and checkbox stay in place there.
   */
  marker: ListKind;
  /** True only in Live Preview, where the card can write back to the line. */
  editable: boolean;
}

export function resolveLayout(line: GlanceLine, settings: GlanceSettings): CardLayout {
  return line.layout ?? settings.defaultCardLayout;
}
