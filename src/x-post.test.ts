import assert from 'node:assert/strict';
import test from 'node:test';

import { xApiUrl, xPostMetadata, xStatusOf } from './x-post.ts';

test('recognises X and Twitter post URLs, share params included', () => {
  assert.deepEqual(xStatusOf('https://x.com/leodev/status/2110373428456820809?s=12'), {
    handle: 'leodev',
    id: '2110373428456820809',
  });
  assert.deepEqual(xStatusOf('https://twitter.com/a_b/status/1/photo/1'), { handle: 'a_b', id: '1' });
  assert.deepEqual(xStatusOf('https://www.x.com/user/statuses/42'), { handle: 'user', id: '42' });
  assert.deepEqual(xStatusOf('https://mobile.twitter.com/user/status/7'), { handle: 'user', id: '7' });
  assert.deepEqual(xStatusOf('https://x.com/i/web/status/99'), { id: '99' });
});

test('ignores everything that is not a single post', () => {
  assert.equal(xStatusOf('https://x.com/leodev'), null);
  assert.equal(xStatusOf('https://x.com/home'), null);
  assert.equal(xStatusOf('https://notx.com/a/status/1'), null);
  assert.equal(xStatusOf('https://example.com/a/status/1'), null);
  assert.equal(xStatusOf('not a url'), null);
});

test('builds the API URL, with a stand-in handle when the link has none', () => {
  assert.equal(xApiUrl({ handle: 'leodev', id: '5' }), 'https://api.fxtwitter.com/leodev/status/5');
  assert.equal(xApiUrl({ id: '5' }), 'https://api.fxtwitter.com/i/status/5');
});

const body = {
  code: 200,
  tweet: {
    text: "here's my workflow\n\nsetup:\n- t3 code",
    created_timestamp: 1791987208,
    likes: 327,
    replies: 25,
    retweets: 8,
    author: {
      name: 'Leo',
      screen_name: 'leodev',
      avatar_url: 'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    },
    media: {
      all: [
        { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
        { type: 'video', url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://pbs.twimg.com/thumb.jpg' },
        { type: 'photo', url: 'http://insecure.example/x.jpg' },
      ],
    },
  },
};

test('maps a post onto card metadata, text and media intact', () => {
  const url = 'https://x.com/leodev/status/2110373428456820809?s=12';
  const metadata = xPostMetadata(body, url, 1);
  assert.ok(metadata?.post);
  assert.equal(metadata.url, url);
  assert.equal(metadata.title, 'Leo (@leodev)');
  assert.equal(metadata.description, "here's my workflow setup: - t3 code");
  assert.equal(metadata.image, 'https://pbs.twimg.com/media/a.jpg');
  assert.equal(metadata.siteName, 'x.com');
  assert.equal(metadata.degraded, false);
  assert.equal(metadata.post.text, "here's my workflow\n\nsetup:\n- t3 code");
  assert.equal(metadata.post.createdAt, 1791987208000);
  assert.equal(metadata.post.likes, 327);
  assert.equal(metadata.post.reposts, 8);
  assert.deepEqual(metadata.post.media, [
    { type: 'photo', thumbnail: 'https://pbs.twimg.com/media/a.jpg' },
    { type: 'video', thumbnail: 'https://pbs.twimg.com/thumb.jpg' },
  ]);
});

test('returns null for anything that is not a post', () => {
  assert.equal(xPostMetadata({ code: 404, message: 'NOT_FOUND' }, 'https://x.com/a/status/1'), null);
  assert.equal(xPostMetadata({ tweet: { text: 'hi', author: {} } }, 'https://x.com/a/status/1'), null);
  assert.equal(xPostMetadata('<!DOCTYPE html>', 'https://x.com/a/status/1'), null);
  assert.equal(xPostMetadata(null, 'https://x.com/a/status/1'), null);
});

test('a media-only post keeps an empty text and no description', () => {
  const metadata = xPostMetadata(
    { tweet: { text: '', author: { screen_name: 'a' }, media: { all: [] } } },
    'https://x.com/a/status/1',
    5,
  );
  assert.equal(metadata?.post?.text, '');
  assert.equal(metadata?.description, undefined);
  assert.equal(metadata?.post?.authorName, 'a');
  assert.equal(metadata?.post?.createdAt, 5);
});
