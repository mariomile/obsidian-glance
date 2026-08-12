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

  pill.append(refreshAction(context, host));

  const writer = context.write;
  if (context.editable && writer) {
    const embedded = context.layout === 'embed';
    pill.append(action(
      'embed',
      'app-window',
      embedded ? 'Show card' : 'Embed web page',
      () => writer.setLayout(embedded ? host.settings().defaultCardLayout : 'embed'),
    ));

    // Compact vs. expanded is meaningless for an embed, so the size toggle
    // only applies to the two card layouts.
    if (!embedded) {
      const compact = context.layout === 'compact';
      pill.append(action(
        'size',
        compact ? 'chevrons-up-down' : 'chevrons-down-up',
        compact ? 'Expand card' : 'Collapse card',
        () => writer.setLayout(compact ? 'expanded' : 'compact'),
      ));
    }
  }

  return pill;
}

/**
 * The skeleton state's only action: refresh alone, in its own pill.
 *
 * Without this, a card whose fetch resolves after nobody's still listening —
 * a host app that tears down and rebuilds the DOM mid-stream can lose the
 * update between mount and metadata landing — has no way back except
 * reopening the note. One retry button on the loading state closes that gap.
 */
export function createLoadingActions(context: CardContext, host: CardHost): HTMLElement {
  const pill = document.createElement('div');
  pill.className = 'glance-card__actions';
  pill.append(refreshAction(context, host));
  return pill;
}

function refreshAction(context: CardContext, host: CardHost): HTMLButtonElement {
  return action('refresh', 'refresh-cw', 'Refresh link preview', (button) => {
    button.addClass('is-spinning');
    void host.store.refresh(context.line.url, context.line.label).finally(() => {
      button.removeClass('is-spinning');
    });
  });
}

/**
 * The inline link editor: an input over the card body holding the current URL.
 *
 * Focus works because CodeMirror sets `contentEditable = "false"` on widget
 * wrappers, and form controls inside such an island behave normally. Keystrokes
 * are stopped from propagating, otherwise they would also reach CodeMirror's
 * own key handling underneath.
 */
export function createInlineEditor(
  url: string,
  onCommit: (url: string) => void,
  onCancel: () => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'glance-card__edit';
  input.value = url;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Link URL');

  let settled = false;
  const settle = (commit: boolean): void => {
    if (settled) return;
    settled = true;
    if (commit) onCommit(input.value);
    else onCancel();
  };

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      settle(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      settle(false);
    }
  });
  input.addEventListener('blur', () => settle(false));
  // The whole card surface is an anchor; a click in the input must not open it.
  input.addEventListener('click', (event) => event.stopPropagation());

  return input;
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
