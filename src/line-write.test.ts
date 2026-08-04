import assert from 'node:assert/strict';
import test from 'node:test';

import { withChecked, withLayout, withLink } from './line-write.ts';
import { parseGlanceLine, serializeGlanceLine } from './link-source.ts';
import type { GlanceLine } from './model.ts';

function lineOf(text: string): GlanceLine {
  const line = parseGlanceLine(text);
  assert.ok(line, `expected to parse: ${JSON.stringify(text)}`);
  return line;
}

function transform(text: string, change: (line: GlanceLine) => GlanceLine): string {
  return serializeGlanceLine(change(lineOf(text)));
}

test('withChecked flips only the checkbox character', () => {
  assert.equal(
    transform('- [ ] https://example.com', (line) => withChecked(line, true)),
    '- [x] https://example.com',
  );
  assert.equal(
    transform('- [x] https://example.com', (line) => withChecked(line, false)),
    '- [ ] https://example.com',
  );
});

test('withChecked preserves indentation, spacing and the layout marker', () => {
  assert.equal(
    transform('\t-   [ ] https://example.com %%glance:compact%%', (line) => withChecked(line, true)),
    '\t-   [x] https://example.com %%glance:compact%%',
  );
});

test('withChecked is a no-op on a line that is not a task', () => {
  assert.equal(
    transform('- https://example.com', (line) => withChecked(line, true)),
    '- https://example.com',
  );
  assert.equal(
    transform('https://example.com', (line) => withChecked(line, true)),
    'https://example.com',
  );
});

test('withLayout adds, replaces and removes the marker', () => {
  assert.equal(
    transform('https://example.com', (line) => withLayout(line, 'compact')),
    'https://example.com %%glance:compact%%',
  );
  assert.equal(
    transform('https://example.com %%glance:compact%%', (line) => withLayout(line, 'expanded')),
    'https://example.com %%glance:expand%%',
  );
  assert.equal(
    transform('https://example.com %%glance:compact%%', (line) => withLayout(line, undefined)),
    'https://example.com',
  );
});

test('withLayout leaves the list prefix untouched', () => {
  assert.equal(
    transform('- [x] https://example.com', (line) => withLayout(line, 'compact')),
    '- [x] https://example.com %%glance:compact%%',
  );
  assert.equal(
    transform('  3. https://example.com', (line) => withLayout(line, 'compact')),
    '  3. https://example.com %%glance:compact%%',
  );
});

test('withLink swaps the url and keeps a markdown label', () => {
  assert.equal(
    transform('https://example.com', (line) => withLink(line, 'https://other.test')),
    'https://other.test',
  );
  assert.equal(
    transform('[Example](https://example.com)', (line) => withLink(line, 'https://other.test')),
    '[Example](https://other.test)',
  );
});

test('withLink keeps the prefix and the layout marker', () => {
  assert.equal(
    transform('  - [ ] https://example.com %%glance:compact%%', (line) =>
      withLink(line, 'https://other.test'),
    ),
    '  - [ ] https://other.test %%glance:compact%%',
  );
});

test('withLink trims surrounding whitespace from the typed url', () => {
  assert.equal(
    transform('https://example.com', (line) => withLink(line, '  https://other.test  ')),
    'https://other.test',
  );
});

test('withLink rejects a non-web url and returns the line unchanged', () => {
  assert.equal(
    transform('https://example.com', (line) => withLink(line, 'javascript:alert(1)')),
    'https://example.com',
  );
  assert.equal(
    transform('https://example.com', (line) => withLink(line, 'not a url')),
    'https://example.com',
  );
  assert.equal(
    transform('https://example.com', (line) => withLink(line, '')),
    'https://example.com',
  );
});

test('the transforms never mutate their input', () => {
  const line = lineOf('- [ ] https://example.com');
  withChecked(line, true);
  withLayout(line, 'compact');
  withLink(line, 'https://other.test');
  assert.equal(serializeGlanceLine(line), '- [ ] https://example.com');
  assert.equal(line.checked, false);
  assert.equal(line.layout, undefined);
});

test('a transformed line still round-trips through the parser', () => {
  const written = transform('- [ ] https://example.com', (line) => withChecked(line, true));
  const reparsed = lineOf(written);
  assert.equal(reparsed.checked, true);
  assert.equal(reparsed.list, 'task');
  assert.equal(serializeGlanceLine(reparsed), written);
});
