import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editorSourceUrl = new URL('./editor.ts', import.meta.url);
const cardSourceUrl = new URL('./card.ts', import.meta.url);

test('editor rendering never changes Markdown and provides block replacements from state', async () => {
  const source = await readFile(editorSourceUrl, 'utf8');

  assert.doesNotMatch(source, /\bchanges\s*:/);
  assert.doesNotMatch(source, /ViewPlugin\.define\s*\(/);
  assert.match(source, /Decoration\.replace\s*\(/);
  assert.match(source, /StateField\.define\s*</);
  assert.match(source, /EditorView\.decorations\.from\s*\(/);
  // Incremental updates must carry unaffected decorations forward through
  // position mapping instead of rescanning the whole document per transaction.
  assert.match(source, /decorations\.map\(transaction\.changes\)/);
  assert.match(
    source,
    /update:\s*\(decorations, transaction\)\s*=>\s*updateDecorations\(decorations, transaction, host\)/s,
  );
});

test('card.ts never restyles the wrapper element it is handed', async () => {
  const source = await readFile(cardSourceUrl, 'utf8');

  // The card owns a child element it creates itself; the wrapper belongs to
  // the caller (glance-editor-card / glance-reading-card) and carries the
  // layout classes. Assigning to the wrapper's className wipes them on every
  // render — the bug this guard exists to prevent from returning.
  assert.doesNotMatch(source, /\bwrapper\.className\s*=/);
  assert.doesNotMatch(source, /\bwrapper\.classList\b/);
  assert.match(source, /\bwrapper\.append\(/);
});
