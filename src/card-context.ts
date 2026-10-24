import type { CardLayout, GlanceLine, GlanceSettings } from './model.ts';

/**
 * Everything that varies per mounted card.
 *
 * This module holds no Obsidian import on purpose: `obsidian` is a types-only
 * package replaced by esbuild at build time, so any module importing it cannot
 * be loaded by the test runner. Keeping the context and its resolver here
 * makes them directly testable, and gives the card's sub-modules something to
 * import that does not point back at `card.ts`.
 */
/**
 * The two ways a card may write back to its own line. Implemented by
 * `line-write.ts`, declared here so this module keeps no dependencies.
 */
export interface CardWriter {
  setLink(url: string): void;
  setLayout(layout: CardLayout | undefined): void;
}

export interface CardContext {
  line: GlanceLine;
  /** Already resolved against the setting. */
  layout: CardLayout;
  /** True only in Live Preview, where the card can write back to the line. */
  editable: boolean;
  /** Present only when `editable`. */
  write?: CardWriter;
  /** Tells the editor to hold this line's card while its input has focus. */
  onEditBegin?: () => void;
  onEditEnd?: () => void;
}

/** A marker on the line wins; otherwise a list item takes the list size, so
 *  a card in an outline stays one row and the bullets around it stay legible. */
export function resolveLayout(line: GlanceLine, settings: GlanceSettings): CardLayout {
  if (line.layout) return line.layout;
  if (line.list !== 'none' && settings.listCardLayout !== 'default') return settings.listCardLayout;
  return settings.defaultCardLayout;
}
