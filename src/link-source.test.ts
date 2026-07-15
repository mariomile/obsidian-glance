import assert from 'node:assert/strict';
import test from 'node:test';

import { domainLabel, parseStandaloneLink, resolveWebUrl } from './link-source.ts';

test('parses a raw standalone URL', () => {
  assert.deepEqual(parseStandaloneLink('  https://example.com/path?q=1  '), {
    url: 'https://example.com/path?q=1',
  });
});

test('parses a standard Markdown link', () => {
  assert.deepEqual(parseStandaloneLink('[Example](https://example.com/page)'), {
    label: 'Example',
    url: 'https://example.com/page',
  });
});

test('parses links inside bullet and numbered list items', () => {
  assert.deepEqual(parseStandaloneLink('- https://example.com/path'), {
    url: 'https://example.com/path',
  });
  assert.deepEqual(parseStandaloneLink('  * https://example.com'), {
    url: 'https://example.com',
  });
  assert.deepEqual(parseStandaloneLink('3. [Example](https://example.com/page)'), {
    label: 'Example',
    url: 'https://example.com/page',
  });
});

test('leaves tasks, dashes without links, and prose bullets alone', () => {
  assert.equal(parseStandaloneLink('- [ ] https://example.com'), null);
  assert.equal(parseStandaloneLink('- [x] [Example](https://example.com)'), null);
  assert.equal(parseStandaloneLink('- some text https://example.com'), null);
  assert.equal(parseStandaloneLink('---'), null);
});

test('leaves inline links and unsafe protocols alone', () => {
  assert.equal(parseStandaloneLink('Read [Example](https://example.com) today'), null);
  assert.equal(parseStandaloneLink('file:///etc/passwd'), null);
  assert.equal(parseStandaloneLink('[Mail](mailto:test@example.com)'), null);
});

test('resolves relative web assets and rejects non-web protocols', () => {
  assert.equal(resolveWebUrl('/cover.jpg', 'https://example.com/post'), 'https://example.com/cover.jpg');
  assert.equal(resolveWebUrl('javascript:alert(1)', 'https://example.com'), undefined);
});

test('formats a readable domain label', () => {
  assert.equal(domainLabel('https://www.example.com/path'), 'example.com');
});
