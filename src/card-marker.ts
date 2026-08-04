import type { CardContext } from './card-context.ts';

/**
 * Draws the list marker the card had to swallow.
 *
 * A CodeMirror `block: true` widget must span whole lines, so the native
 * bullet cannot be left standing outside the replaced range — and an inline
 * widget the height of a card corrupts the height map (see the note in
 * editor.ts). Reading mode keeps its real <li> marker and passes
 * `marker: 'none'`, so nothing is drawn there.
 *
 * Plain DOM only, no Obsidian helpers, so this module stays loadable outside
 * the app.
 */
export function createMarker(
  context: CardContext,
  onToggle?: (checked: boolean) => void,
): HTMLElement | null {
  if (context.marker === 'none') return null;

  const slot = document.createElement('div');

  if (context.marker === 'ordered') {
    slot.className = 'glance-card__marker glance-card__marker--ordered';
    slot.textContent = orderedMarkerText(context.line.prefix);
    return slot;
  }

  if (context.marker === 'bullet') {
    slot.className = 'glance-card__marker glance-card__marker--bullet';
    return slot;
  }

  slot.className = 'glance-card__marker glance-card__marker--task';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  // Obsidian's own class, so themes — Cosmos included — skin this checkbox
  // exactly like a native task checkbox, with no styling of our own.
  checkbox.className = 'task-list-item-checkbox';
  checkbox.checked = context.line.checked === true;
  checkbox.disabled = !context.editable || !onToggle;
  if (onToggle) {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      onToggle(checkbox.checked);
    });
  }
  slot.append(checkbox);
  return slot;
}

function orderedMarkerText(prefix: string): string {
  return /(\d{1,9}[.)])/.exec(prefix)?.[1] ?? '';
}
