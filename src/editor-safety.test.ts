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

const lineWriteSourceUrl = new URL('./line-write.ts', import.meta.url);
const cardActionsSourceUrl = new URL('./card-actions.ts', import.meta.url);
const cardMarkerSourceUrl = new URL('./card-marker.ts', import.meta.url);

test('line-write.ts is the only module that dispatches a document change', async () => {
  // README's source-pure promise rests on the decoration pipeline never
  // mutating the document. Confining every dispatch to one module is what
  // makes that auditable — and is why the `changes:` guard on editor.ts above
  // can stay in place while the card gained write actions.
  const writeSource = await readFile(lineWriteSourceUrl, 'utf8');
  assert.match(writeSource, /view\.dispatch\(\{\s*changes:/);

  for (const url of [cardSourceUrl, cardActionsSourceUrl, cardMarkerSourceUrl]) {
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /\.dispatch\(/, `unexpected dispatch in ${url.pathname}`);
  }
});

test('editor.ts dispatches effects only, never document changes', async () => {
  // editor.ts gained a dispatch with inline editing, but only of effects: the
  // `changes:` guard in the first test is what keeps that honest, and this
  // pairs the two assertions at the point where dispatch actually appears.
  const source = await readFile(editorSourceUrl, 'utf8');

  assert.match(source, /view\.dispatch\(\{\s*effects:/);
  assert.doesNotMatch(source, /\bchanges\s*:/);
});
