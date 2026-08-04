import { setIcon } from 'obsidian';

import type { CardContext } from './card-context.ts';
import type { CardHost } from './card.ts';

/**
 * The card's action cluster.
 *
 * One shared surface rather than four independent boxes: four shadowed 28px
 * squares would checkerboard 122px of artwork. Edit and the size toggle render
 * only where the card can write back to its line, which is what leaves Reading
 * mode with copy and refresh alone — no second branch in the renderer.
 */
export function createActions(
  context: CardContext,
  host: CardHost,
  onEdit?: () => void,
): HTMLElement {
  const pill = document.createElement('div');
  pill.className = 'glance-card__actions';

  if (context.editable && onEdit) {
    pill.append(action('edit', 'pencil', 'Edit link', () => onEdit()));
  }

  pill.append(action('copy', 'copy', 'Copy link', (button) => {
    void navigator.clipboard.writeText(context.line.url).then(() => {
      button.addClass('is-copied');
      setIcon(button, 'check');
      window.clearTimeout(Number(button.dataset.resetHandle));
      button.dataset.resetHandle = String(window.setTimeout(() => {
        button.removeClass('is-copied');
        setIcon(button, 'copy');
      }, 1200));
    });
  }));

  pill.append(action('refresh', 'refresh-cw', 'Refresh link preview', (button) => {
    button.addClass('is-spinning');
    void host.store.refresh(context.line.url, context.line.label).finally(() => {
      button.removeClass('is-spinning');
    });
  }));

  const writer = context.write;
  if (context.editable && writer) {
    const compact = context.layout === 'compact';
    pill.append(action(
      'size',
      compact ? 'chevrons-up-down' : 'chevrons-down-up',
      compact ? 'Expand card' : 'Collapse card',
      () => writer.setLayout(compact ? 'expanded' : 'compact'),
    ));
  }

  return pill;
}

function action(
  name: string,
  icon: string,
  label: string,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `glance-card__action glance-card__action--${name} clickable-icon`;
  button.setAttribute('aria-label', label);
  setIcon(button, icon);
  button.addEventListener('click', (event) => {
    // The whole card surface is an anchor; without this every action would
    // also open the link.
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}
