import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLayout } from './card-context.ts';
import { parseGlanceLine } from './link-source.ts';
import { DEFAULT_SETTINGS, type GlanceLine, type GlanceSettings } from './model.ts';

function settingsWith(defaultCardLayout: GlanceSettings['defaultCardLayout']): GlanceSettings {
  return { ...DEFAULT_SETTINGS, defaultCardLayout };
}

function lineOf(text: string): GlanceLine {
  const line = parseGlanceLine(text);
  assert.ok(line, `expected to parse: ${text}`);
  return line;
}

test('an unmarked line follows the global default', () => {
  assert.equal(resolveLayout(lineOf('https://example.com'), settingsWith('expanded')), 'expanded');
  assert.equal(resolveLayout(lineOf('https://example.com'), settingsWith('compact')), 'compact');
});

test('a marker overrides the global default in both directions', () => {
  const compactMarked = lineOf('https://example.com %%glance:compact%%');
  const expandMarked = lineOf('https://example.com %%glance:expand%%');

  assert.equal(resolveLayout(compactMarked, settingsWith('expanded')), 'compact');
  assert.equal(resolveLayout(expandMarked, settingsWith('compact')), 'expanded');
});

test('the embed marker overrides the global default', () => {
  const embedMarked = lineOf('https://example.com %%glance:embed%%');
  assert.equal(resolveLayout(embedMarked, settingsWith('expanded')), 'embed');
  assert.equal(resolveLayout(embedMarked, settingsWith('compact')), 'embed');
});

test('the override applies inside lists and tasks too', () => {
  assert.equal(
    resolveLayout(lineOf('- [ ] https://example.com %%glance:expand%%'), settingsWith('compact')),
    'expanded',
  );
  assert.equal(
    resolveLayout(lineOf('  - https://example.com %%glance:compact%%'), settingsWith('expanded')),
    'compact',
  );
});

test('a list item takes the list size, whatever the global default', () => {
  const settings = { ...settingsWith('expanded'), listCardLayout: 'compact' as const };
  assert.equal(resolveLayout(lineOf('- https://example.com'), settings), 'compact');
  assert.equal(resolveLayout(lineOf('\t- [ ] https://example.com'), settings), 'compact');
  assert.equal(resolveLayout(lineOf('2. ![](https://x.com/a/status/1)'), settings), 'compact');
  assert.equal(resolveLayout(lineOf('https://example.com'), settings), 'expanded');
});

test('a marker still beats the list size', () => {
  const settings = { ...settingsWith('expanded'), listCardLayout: 'compact' as const };
  assert.equal(resolveLayout(lineOf('- https://example.com %%glance:expand%%'), settings), 'expanded');
});

test("'default' makes list items follow the global default", () => {
  const settings = { ...settingsWith('expanded'), listCardLayout: 'default' as const };
  assert.equal(resolveLayout(lineOf('- https://example.com'), settings), 'expanded');
  assert.equal(
    resolveLayout(lineOf('- https://example.com'), { ...settings, defaultCardLayout: 'compact' }),
    'compact',
  );
});
