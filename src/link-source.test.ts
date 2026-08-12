import assert from 'node:assert/strict';
import test from 'node:test';

import {
  domainLabel,
  isSafeWebUrl,
  parseGlanceLine,
  resolveWebUrl,
  serializeGlanceLine,
} from './link-source.ts';

test('parses a raw standalone URL', () => {
  const line = parseGlanceLine('  https://example.com/path?q=1  ');
  assert.equal(line?.url, 'https://example.com/path?q=1');
  assert.equal(line?.label, undefined);
  assert.equal(line?.list, 'none');
  assert.equal(line?.layout, undefined);
});

test('parses a standard Markdown link and keeps its label', () => {
  const line = parseGlanceLine('[Example](https://example.com/page)');
  assert.equal(line?.url, 'https://example.com/page');
  assert.equal(line?.label, 'Example');
});

test('classifies list kinds', () => {
  assert.equal(parseGlanceLine('- https://example.com')?.list, 'bullet');
  assert.equal(parseGlanceLine('* https://example.com')?.list, 'bullet');
  assert.equal(parseGlanceLine('+ https://example.com')?.list, 'bullet');
  assert.equal(parseGlanceLine('3. https://example.com')?.list, 'ordered');
  assert.equal(parseGlanceLine('3) https://example.com')?.list, 'ordered');
  assert.equal(parseGlanceLine('- [ ] https://example.com')?.list, 'task');
  assert.equal(parseGlanceLine('https://example.com')?.list, 'none');
});

test('parses links inside list items, label included', () => {
  assert.equal(parseGlanceLine('  * https://example.com')?.url, 'https://example.com');
  const ordered = parseGlanceLine('3. [Example](https://example.com/page)');
  assert.equal(ordered?.url, 'https://example.com/page');
  assert.equal(ordered?.label, 'Example');
});

test('reads the task checkbox state', () => {
  assert.equal(parseGlanceLine('- [ ] https://example.com')?.checked, false);
  assert.equal(parseGlanceLine('- [x] https://example.com')?.checked, true);
  assert.equal(parseGlanceLine('- [X] https://example.com')?.checked, true);
  assert.equal(parseGlanceLine('https://example.com')?.checked, undefined);
});

test('parses a Markdown link inside a task item', () => {
  const line = parseGlanceLine('- [x] [Example](https://example.com)');
  assert.equal(line?.url, 'https://example.com');
  assert.equal(line?.label, 'Example');
  assert.equal(line?.list, 'task');
  assert.equal(line?.checked, true);
});

test('reads the layout marker', () => {
  assert.equal(parseGlanceLine('https://example.com %%glance:compact%%')?.layout, 'compact');
  assert.equal(parseGlanceLine('https://example.com %%glance:expand%%')?.layout, 'expanded');
  assert.equal(parseGlanceLine('https://example.com %%glance:embed%%')?.layout, 'embed');
  assert.equal(parseGlanceLine('https://example.com')?.layout, undefined);
});

test('computes the indent level from tabs and space pairs', () => {
  assert.equal(parseGlanceLine('https://example.com')?.indentLevel, 0);
  assert.equal(parseGlanceLine('  - https://example.com')?.indentLevel, 1);
  assert.equal(parseGlanceLine('    - https://example.com')?.indentLevel, 2);
  assert.equal(parseGlanceLine('\t- https://example.com')?.indentLevel, 1);
  assert.equal(parseGlanceLine('\t\t- https://example.com')?.indentLevel, 2);
});

test('leaves prose bullets, bare dashes and inline links alone', () => {
  assert.equal(parseGlanceLine('- some text https://example.com'), null);
  assert.equal(parseGlanceLine('---'), null);
  assert.equal(parseGlanceLine('Read [Example](https://example.com) today'), null);
  assert.equal(parseGlanceLine('https://example.com and more'), null);
  assert.equal(parseGlanceLine('plain text'), null);
  assert.equal(parseGlanceLine(''), null);
});

test('leaves unsafe protocols alone', () => {
  assert.equal(parseGlanceLine('file:///etc/passwd'), null);
  assert.equal(parseGlanceLine('[Mail](mailto:test@example.com)'), null);
  assert.equal(parseGlanceLine('javascript:alert(1)'), null);
});

test('serialize(parse(line)) reproduces the line byte for byte', () => {
  const lines = [
    'https://example.com',
    '[Example](https://example.com)',
    '[Example](https://example.com "The title")',
    '- https://example.com',
    '-   https://example.com',
    '  * [Example](https://example.com)',
    '\t- [ ] https://example.com',
    '- [x] https://example.com %%glance:compact%%',
    '12. https://example.com %%glance:expand%%',
    '  https://example.com/path?q=1  ',
  ];

  for (const original of lines) {
    const parsed = parseGlanceLine(original);
    assert.ok(parsed, `expected to parse: ${JSON.stringify(original)}`);
    assert.equal(serializeGlanceLine(parsed), original);
  }
});

test('resolves relative web assets and rejects non-web protocols', () => {
  assert.equal(resolveWebUrl('/cover.jpg', 'https://example.com/post'), 'https://example.com/cover.jpg');
  assert.equal(resolveWebUrl('javascript:alert(1)', 'https://example.com'), undefined);
});

test('isSafeWebUrl accepts only http and https', () => {
  assert.equal(isSafeWebUrl('https://example.com'), true);
  assert.equal(isSafeWebUrl('http://example.com'), true);
  assert.equal(isSafeWebUrl('file:///etc/passwd'), false);
  assert.equal(isSafeWebUrl('not a url'), false);
});

test('formats a readable domain label', () => {
  assert.equal(domainLabel('https://www.example.com/path'), 'example.com');
  assert.equal(domainLabel('nonsense'), 'nonsense');
});
