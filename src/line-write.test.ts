import assert from 'node:assert/strict';
import test from 'node:test';

import { withLayout, withLink } from './line-write.ts';
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
  assert.equal(
    transform('https://example.com', (line) => withLayout(line, 'embed')),
    'https://example.com %%glance:embed%%',
  );
  assert.equal(
    transform('https://example.com %%glance:embed%%', (line) => withLayout(line, 'compact')),
    'https://example.com %%glance:compact%%',
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
  withLayout(line, 'compact');
  withLink(line, 'https://other.test');
  assert.equal(serializeGlanceLine(line), '- [ ] https://example.com');
  assert.equal(line.checked, false);
  assert.equal(line.layout, undefined);
});

test('a transformed line still round-trips through the parser', () => {
  const written = transform('- [ ] https://example.com', (line) => withLayout(line, 'compact'));
  const reparsed = lineOf(written);
  assert.equal(reparsed.layout, 'compact');
  assert.equal(reparsed.list, 'task');
  assert.equal(serializeGlanceLine(reparsed), written);
});

test('withLink keeps an X embed an embed while it still points at a post', () => {
  assert.equal(
    transform('- ![Ada](https://x.com/ada/status/1)', (line) => withLink(line, 'https://x.com/other/status/2')),
    '- ![Ada](https://x.com/other/status/2)',
  );
  assert.equal(
    transform('![Ada](https://x.com/ada/status/1)', (line) => withLink(line, 'https://example.com')),
    '[Ada](https://example.com)',
  );
});
