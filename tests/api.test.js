import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';

async function start(dbPath) {
  const app = createApp({ dbPath, seed: false });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { app, base };
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'sai-api-'));
  const dbPath = join(directory, 'test.sqlite');
  const runtime = await start(dbPath);
  t.after(async () => {
    await runtime.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { ...runtime, dbPath };
}

function client(base) {
  let cookie = '';
  return {
    async request(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(method !== 'GET' ? { Origin: base } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return {
        status: response.status,
        headers: response.headers,
        body: await response.json(),
      };
    },
  };
}

async function signup(user, email) {
  const result = await user.request('/api/auth/signup', {
    method: 'POST',
    body: { email, password: 'test-password-42' },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.user.email, email.toLowerCase());
  return result;
}

async function publish(user, content = '이곳에 처음 남기는 이야기예요.') {
  const result = await user.request('/api/posts', {
    method: 'POST',
    body: { content, category: '일상', color: 'sage' },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.post.content, content);
  return result.body.post;
}

function assertAnonymous(value) {
  const forbidden = new Set([
    'email', 'userid', 'user_id', 'authorid', 'author_id',
    'password', 'passwordhash', 'password_hash', 'hash', 'session', 'token',
  ]);
  function inspect(object) {
    if (!object || typeof object !== 'object') return;
    for (const [key, nested] of Object.entries(object)) {
      assert.ok(!forbidden.has(key.toLowerCase()), `Public data exposes ${key}`);
      inspect(nested);
    }
  }
  inspect(value);
}

test('회원가입, 세션 유지, 로그아웃, 재로그인으로 계정을 사용할 수 있다', async (t) => {
  const { base } = await fixture(t);
  const visitor = client(base);
  assert.deepEqual((await visitor.request('/api/session')).body, { user: null });
  assert.equal((await visitor.request('/api/posts')).status, 200);
  assert.equal((await visitor.request('/api/posts?view=mine')).status, 401);
  assert.equal((await visitor.request('/api/posts?view=saved')).status, 401);
  assert.equal((await visitor.request('/api/posts', {
    method: 'POST', body: { content: '로그인 전에는 쓸 수 없어요.' },
  })).status, 401);

  const account = client(base);
  const registered = await signup(account, 'MEMBER@example.com');
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(registered.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.equal((await account.request('/api/session')).body.user.email, 'member@example.com');

  const duplicate = await visitor.request('/api/auth/signup', {
    method: 'POST', body: { email: 'member@example.com', password: 'other-password-1' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await account.request('/api/auth/logout', { method: 'POST' })).status, 200);
  assert.deepEqual((await account.request('/api/session')).body, { user: null });
  assert.equal((await account.request('/api/auth/login', {
    method: 'POST', body: { email: 'member@example.com', password: 'wrong-password' },
  })).status, 401);
  const login = await account.request('/api/auth/login', {
    method: 'POST', body: { email: 'member@example.com', password: 'test-password-42' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, 'member@example.com');
});

test('공개 이야기와 댓글은 익명이고, 다른 회원은 작성자의 글을 삭제할 수 없다', async (t) => {
  const { base } = await fixture(t);
  const alice = client(base);
  const bob = client(base);
  const visitor = client(base);
  await signup(alice, 'alice-private@example.com');
  await signup(bob, 'bob-private@example.com');
  const alicePost = await publish(alice, '익명이어도 진심은 전해질 수 있겠죠.');
  const bobPost = await publish(bob, '오늘은 기분 좋은 하루였어요.');

  const feed = await visitor.request('/api/posts');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.posts.length, 2);
  assertAnonymous(feed.body);
  assert.ok(!JSON.stringify(feed.body).includes('alice-private@example.com'));
  assert.ok(!JSON.stringify(feed.body).includes('bob-private@example.com'));
  for (const post of feed.body.posts) {
    assert.equal(typeof post.authorName, 'string');
    assert.ok(post.authorName.length > 0);
    assert.equal(post.isMine, false);
  }

  const mine = await alice.request('/api/posts?view=mine');
  assert.deepEqual(mine.body.posts.map((post) => post.id), [alicePost.id]);
  assert.equal(mine.body.posts[0].isMine, true);
  assert.equal((await bob.request(`/api/posts/${alicePost.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await visitor.request(`/api/posts/${alicePost.id}`, { method: 'DELETE' })).status, 401);

  const comment = await bob.request(`/api/posts/${alicePost.id}/comments`, {
    method: 'POST', body: { content: '따뜻한 이야기 고마워요.' },
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.comment.content, '따뜻한 이야기 고마워요.');
  const comments = await visitor.request(`/api/posts/${alicePost.id}/comments`);
  assert.equal(comments.body.comments.length, 1);
  assertAnonymous(comments.body);
  assert.ok(!JSON.stringify(comments.body).includes('bob-private@example.com'));
  const refreshed = (await visitor.request('/api/posts')).body.posts.find((post) => post.id === alicePost.id);
  assert.equal(refreshed.commentsCount, 1);

  assert.equal((await alice.request(`/api/posts/${alicePost.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await visitor.request('/api/posts')).body.posts.map((post) => post.id), [bobPost.id]);
});

test('공감과 저장은 계정별로 유지되며 다시 누르면 해제된다', async (t) => {
  const { base } = await fixture(t);
  const author = client(base);
  const reader = client(base);
  const visitor = client(base);
  await signup(author, 'author@example.com');
  await signup(reader, 'reader@example.com');
  const post = await publish(author);
  assert.equal((await visitor.request(`/api/posts/${post.id}/like`, { method: 'POST' })).status, 401);

  const liked = await reader.request(`/api/posts/${post.id}/like`, { method: 'POST' });
  assert.deepEqual(liked.body, { liked: true, likesCount: 1 });
  const personalFeed = (await reader.request('/api/posts')).body.posts[0];
  assert.equal(personalFeed.liked, true);
  assert.equal((await visitor.request('/api/posts')).body.posts[0].liked, false);
  assert.equal((await visitor.request('/api/posts')).body.posts[0].likesCount, 1);
  const unliked = await reader.request(`/api/posts/${post.id}/like`, { method: 'POST' });
  assert.deepEqual(unliked.body, { liked: false, likesCount: 0 });

  assert.equal((await reader.request(`/api/posts/${post.id}/save`, { method: 'POST' })).body.saved, true);
  assert.deepEqual((await reader.request('/api/posts?view=saved')).body.posts.map((item) => item.id), [post.id]);
  assert.equal((await author.request('/api/posts?view=saved')).body.posts.length, 0);
  assert.equal((await reader.request(`/api/posts/${post.id}/save`, { method: 'POST' })).body.saved, false);
  assert.equal((await reader.request('/api/posts?view=saved')).body.posts.length, 0);
});

test('잘못된 입력과 다른 출처에서의 쓰기 요청을 거부한다', async (t) => {
  const { base } = await fixture(t);
  const user = client(base);
  assert.equal((await user.request('/api/auth/signup', {
    method: 'POST', body: { email: 'not-an-email', password: 'test-password-42' },
  })).status, 400);
  assert.equal((await user.request('/api/auth/signup', {
    method: 'POST', body: { email: 'valid@example.com', password: 'short' },
  })).status, 400);
  await signup(user, 'valid@example.com');

  for (const content of ['', '  \n  ', '가'.repeat(1001)]) {
    const result = await user.request('/api/posts', {
      method: 'POST', body: { content, category: '일상', color: 'cream' },
    });
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
  }
  const crossOrigin = await user.request('/api/posts', {
    method: 'POST',
    headers: { Origin: 'https://another-site.example' },
    body: { content: '다른 사이트에서 요청한 글' },
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await user.request('/api/posts')).body.posts.length, 0);
  const post = await publish(user);
  for (const content of [' ', '가'.repeat(301)]) {
    assert.equal((await user.request(`/api/posts/${post.id}/comments`, {
      method: 'POST', body: { content },
    })).status, 400);
  }
  assert.equal((await user.request('/api/posts')).body.posts[0].commentsCount, 0);
});

test('서버를 다시 시작해도 계정, 글, 댓글, 저장이 유지된다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sai-persistence-'));
  const dbPath = join(directory, 'persistent.sqlite');
  let runtime;
  try {
    runtime = await start(dbPath);
    const account = client(runtime.base);
    await signup(account, 'persistent@example.com');
    const post = await publish(account, '다시 접속해도 이 이야기는 여기에.');
    await account.request(`/api/posts/${post.id}/comments`, {
      method: 'POST', body: { content: '댓글도 오래 남아요.' },
    });
    await account.request(`/api/posts/${post.id}/save`, { method: 'POST' });
    await runtime.app.close();
    runtime = undefined;

    runtime = await start(dbPath);
    const returning = client(runtime.base);
    assert.equal((await returning.request('/api/auth/login', {
      method: 'POST', body: { email: 'persistent@example.com', password: 'test-password-42' },
    })).status, 200);
    const feed = await returning.request('/api/posts?view=saved');
    assert.equal(feed.body.posts.length, 1);
    assert.equal(feed.body.posts[0].content, '다시 접속해도 이 이야기는 여기에.');
    assert.equal(feed.body.posts[0].commentsCount, 1);
    assert.equal(feed.body.posts[0].isMine, true);
    const comments = await returning.request(`/api/posts/${post.id}/comments`);
    assert.equal(comments.body.comments[0].content, '댓글도 오래 남아요.');
  } finally {
    if (runtime) await runtime.app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('여러 페이지를 넘겨 모든 글을 중복 없이 읽고 필터 결과 수를 확인할 수 있다', async (t) => {
  const { base } = await fixture(t);
  const writer = client(base);
  const reader = client(base);
  await signup(writer, 'pagination@example.com');
  const createdIds = new Set();
  const categories = ['일상', '고민', '혼잣말'];
  for (let index = 0; index < 29; index++) {
    const result = await writer.request('/api/posts', {
      method: 'POST',
      body: {
        content: `페이지 테스트 이야기 ${index + 1}`,
        category: categories[index % categories.length],
        color: 'cream',
      },
    });
    assert.equal(result.status, 201);
    createdIds.add(result.body.post.id);
  }

  const receivedIds = [];
  for (const [offset, count, hasMore] of [[0, 12, true], [12, 12, true], [24, 5, false]]) {
    const page = await reader.request(`/api/posts?offset=${offset}`);
    assert.equal(page.status, 200);
    assert.equal(page.body.posts.length, count);
    assert.equal(page.body.total, 29);
    assert.equal(page.body.hasMore, hasMore);
    receivedIds.push(...page.body.posts.map((post) => post.id));
  }
  assert.equal(new Set(receivedIds).size, 29, '페이지 사이에 중복 글이 없어야 한다');
  assert.deepEqual(new Set(receivedIds), createdIds, '등록된 모든 글에 도달해야 한다');

  const pastEnd = await reader.request('/api/posts?offset=36');
  assert.deepEqual(pastEnd.body.posts, []);
  assert.equal(pastEnd.body.total, 29);
  assert.equal(pastEnd.body.hasMore, false);

  const filtered = await reader.request(`/api/posts?${new URLSearchParams({ category: '고민', q: '페이지 테스트', limit: '4' })}`);
  assert.equal(filtered.body.total, 10);
  assert.equal(filtered.body.posts.length, 4);
  assert.equal(filtered.body.hasMore, true);
  assert.ok(filtered.body.posts.every((post) => post.category === '고민'));
  const lastFiltered = await reader.request(`/api/posts?${new URLSearchParams({ category: '고민', q: '페이지 테스트', offset: '8', limit: '4' })}`);
  assert.equal(lastFiltered.body.posts.length, 2);
  assert.equal(lastFiltered.body.total, 10);
  assert.equal(lastFiltered.body.hasMore, false);

  for (const value of ['-1', '1.5', 'abc', '', '9007199254740992']) {
    assert.equal((await reader.request(`/api/posts?${new URLSearchParams({ offset: value })}`)).status, 400);
  }
  for (const value of ['0', '51', '1.5', 'abc', '']) {
    assert.equal((await reader.request(`/api/posts?${new URLSearchParams({ limit: value })}`)).status, 400);
  }
});
