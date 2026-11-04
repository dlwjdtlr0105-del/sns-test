import { test, expect } from '@playwright/test';

test('anyone can read, filter, and search stories without an account', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '이야기 둘러보기' })).toBeVisible();
  await expect(page.locator('.post-card').filter({ hasText: '예시 이야기' })).toHaveCount(8);
  await page.getByRole('button', { name: '고민', exact: true }).click();
  await expect(page.locator('.post-card').filter({ hasText: '예시 이야기' })).toHaveCount(2);
  expect(await page.locator('.post-card .post-tag').allTextContents()).toEqual(expect.arrayContaining(['고민']));
  expect((await page.locator('.post-card .post-tag').allTextContents()).every(tag => tag === '고민')).toBe(true);
  await expect(page.locator('.post-card .post-tag').first()).toHaveText('고민');
  await page.getByRole('button', { name: '모든 이야기', exact: true }).click();
  await page.getByRole('textbox', { name: '이야기 검색' }).fill('고양이');
  await expect(page.locator('.post-card')).toHaveCount(1);
  await expect(page.locator('.post-card')).toContainText('고양이');
  await page.getByRole('textbox', { name: '이야기 검색' }).fill('존재하지않는이야기-xyz');
  await expect(page.getByText('아직 닿지 않은 이야기네요')).toBeVisible();
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.locator('.post-card').filter({ hasText: '예시 이야기' })).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('signup → anonymous post → reaction → comment → save → logout → public read', async ({ page, browser }) => {
  const email = `sai-${crypto.randomUUID()}@example.com`;
  const content = `작은 마음을 나눠요 ${crypto.randomUUID().slice(0,8)}`;
  await page.goto('/');
  await page.getByRole('button', { name: '이야기 쓰기', exact: true }).click();
  const auth = page.getByRole('dialog');
  await expect(auth).toBeVisible();
  await auth.getByLabel('이메일', { exact: true }).fill(email);
  await auth.getByLabel('비밀번호', { exact: true }).fill('quiet-morning-123');
  await auth.getByRole('button', { name: '익명으로 시작하기' }).click();
  const compose = page.getByRole('dialog', { name: '이야기 쓰기' });
  await expect(compose).toBeVisible();
  await compose.getByRole('textbox', { name: '이야기 내용' }).fill(content);
  await compose.getByRole('button', { name: '고민', exact: true }).click();
  await compose.getByRole('button', { name: 'lavender 배경' }).click();
  await compose.getByRole('button', { name: '이야기 남기기' }).click();
  let card = page.locator('.post-card').filter({ hasText: content });
  await expect(card).toBeVisible();
  await expect(card.locator('.post-tag')).toHaveText('고민');
  await expect(card).not.toContainText(email);
  await card.getByRole('button', { name: /^공감/ }).click();
  await expect(card.getByRole('button', { name: '공감 1개' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: '이야기 저장', exact: true }).click();
  await expect(card.getByRole('button', { name: '이야기 저장 취소' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: /^댓글/ }).click();
  const detail = page.getByRole('dialog', { name: '이야기와 댓글' });
  await detail.getByRole('textbox', { name: '댓글 내용' }).fill('당신의 마음에 공감해요.');
  await detail.getByRole('button', { name: '보내기' }).click();
  await expect(detail.locator('.comment')).toContainText('당신의 마음에 공감해요.');
  await detail.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: '간직한 이야기', exact: true }).click();
  await expect(page.locator('.post-card')).toHaveCount(1);
  await expect(page.locator('.post-card')).toContainText(content);
  await page.reload();
  await expect(page.getByRole('button', { name: /익명의 나/ })).toBeVisible();
  await page.getByRole('button', { name: /익명의 나/ }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await reader.goto('http://127.0.0.1:3101/');
  await expect(reader.locator('.post-card').filter({ hasText: content })).toBeVisible();
  await expect(reader.locator('.post-card').filter({ hasText: content })).not.toContainText(email);
  await readerContext.close();
});

test('mobile layout fits narrow screens, forms stay legible, and PWA metadata is available', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.getByRole('button', { name: '시작하기' }).click();
  const inputSize = await page.getByLabel('이메일', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(inputSize).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: '닫기' }).click();
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe('standalone');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  const icons = await request.get('/icons/icon-192.png');
  expect(icons.ok()).toBeTruthy();
});

test('installed PWA shows an offline screen and keeps account and story data out of its cache', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async name => (await caches.open(name)).keys()));
    return requests.flat().map(request => new URL(request.url).pathname);
  });
  expect(cachedPaths).toEqual(['/offline.html']);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /잠시 연결을/ })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: '다시 연결하기' }).click();
  await expect(page.getByRole('heading', { name: '이야기 둘러보기' })).toBeVisible();
});

test('a slow reaction from the saved list cannot remove stories after switching feeds', async ({ page }) => {
  const signup = await page.request.post('/api/auth/signup', { data: { email: `race-${crypto.randomUUID()}@example.com`, password: 'gentle-afternoon-123' } });
  expect(signup.status()).toBe(201);
  const created = await page.request.post('/api/posts', { data: { content: `천천히 전해지는 마음도 괜찮아요. ${crypto.randomUUID().slice(0,8)}`, category: '일상', color: 'sage' } });
  const { post } = await created.json();
  expect((await page.request.post(`/api/posts/${post.id}/save`)).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /익명의 나/ })).toBeVisible();
  await page.getByRole('button', { name: '간직한 이야기', exact: true }).click();
  await expect(page.locator('.post-card')).toHaveCount(1);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`**/api/posts/${post.id}/like`, async route => { await gate; await route.continue(); });
  try {
    await page.locator('.post-card').getByRole('button', { name: /^공감/ }).click();
    const allNav = page.getByRole('button', { name: /^(이야기 둘러보기|둘러보기)$/ });
    await allNav.click();
    await expect(page.locator('.post-card').filter({ hasText: '예시 이야기' })).toHaveCount(8);
    const response = page.waitForResponse(res => res.url().endsWith(`/posts/${post.id}/like`) && res.request().method() === 'POST');
    release();
    await response;
    await expect(page.locator('.post-card').filter({ hasText: '예시 이야기' })).toHaveCount(8);
    await expect(page.locator('.post-card').filter({ hasText: post.content }).getByRole('button', { name: '공감 1개' })).toHaveAttribute('aria-pressed', 'true');
  } finally { release(); }
});
