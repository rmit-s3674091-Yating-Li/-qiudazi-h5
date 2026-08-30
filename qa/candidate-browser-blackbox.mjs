import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN || '';
if (!baseUrl || !expectedSha) throw new Error('BASE_URL and EXPECTED_SHA are required');

const protectionHeaders = oidcToken
  ? { 'x-vercel-trusted-oidc-idp-token': oidcToken }
  : {};

const outDir = path.join(process.cwd(), 'qa-artifacts');
fs.mkdirSync(outDir, { recursive: true });
const results = { baseUrl, expectedSha, authMode: oidcToken ? 'github-oidc' : 'none', startedAt: new Date().toISOString(), checks: [] };
const record = (name, ok, details = '') => { results.checks.push({ name, ok, details }); if (!ok) throw new Error(`${name}: ${details}`); };

async function waitForExactDeployment() {
  const deadline = Date.now() + 6 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(new URL('/build-meta.json', baseUrl), {
        cache: 'no-store',
        headers: protectionHeaders,
        redirect: 'follow',
      });
      const contentType = r.headers.get('content-type') || '';
      if (r.ok && contentType.includes('application/json')) {
        const meta = await r.json();
        last = JSON.stringify(meta);
        if (meta.sha === expectedSha) { record('exact-head deployment reached', true, last); return; }
      } else {
        const body = await r.text();
        last = `HTTP ${r.status} ${contentType}; body=${body.slice(0, 120).replace(/\s+/g, ' ')}`;
      }
    } catch (e) { last = String(e); }
    await new Promise(r => setTimeout(r, 5000));
  }
  record('exact-head deployment reached', false, `expected ${expectedSha}; auth=${results.authMode}; last=${last}`);
}

function contextOptions(viewport, language = 'zh') {
  return {
    viewport,
    locale: language === 'en' ? 'en-US' : 'zh-CN',
    extraHTTPHeaders: protectionHeaders,
  };
}

async function completeIdentity(page, nickname, withUpload = false) {
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (page.url().includes('/profile')) {
    const nicknameInput = page.locator('input[autocomplete="nickname"]');
    await nicknameInput.waitFor({ state: 'visible', timeout: 20_000 });
    await nicknameInput.fill(nickname);
    if (withUpload) {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSMAAAAASUVORK5CYII=', 'base64');
      await page.locator('input[type=file]').setInputFiles({ name: 'qa-avatar.png', mimeType: 'image/png', buffer: png });
    }
    await page.locator('input[type=checkbox]').check();
    await page.locator('button[type=submit], button.full').filter({ hasText: /开始打球|Start playing|继续/ }).first().click();
    await page.waitForURL(/#\/events(?:$|\?)/, { timeout: 30_000 });
  }
  const text = await page.locator('body').innerText();
  record(`identity ready: ${nickname}`, !/当前没有配置在线数据库|online database is not configured/i.test(text), text.slice(0, 160));
}

async function assertMobileShell(browserType, viewport, label, language = 'zh') {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions(viewport, language));
  if (language === 'en') await context.addInitScript(() => localStorage.setItem('qiudazi-language', 'en'));
  const page = await context.newPage();
  await completeIdentity(page, `QA-${label}-${expectedSha.slice(0,6)}`);
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} no horizontal overflow`, overflow <= 1, `overflow=${overflow}`);
  const quick = page.locator('.quick-start-fab');
  await quick.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await quick.boundingBox();
  record(`${label} quick-start visible in viewport`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify(box));
  const navTargets = ['#/events', '#/my-events', '#/players', '#/me'];
  for (const target of navTargets) record(`${label} nav ${target}`, await page.locator(`a[href="${target}"]`).count() > 0);
  if (language === 'en') record(`${label} English quick action`, await page.locator('[aria-label="Quick start"]').count() > 0);
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  await context.close();
  await browser.close();
}

async function assertDualSession() {
  const browser = await chromium.launch();
  const a = await browser.newContext(contextOptions({ width: 390, height: 844 }));
  const b = await browser.newContext(contextOptions({ width: 390, height: 844 }));
  const pa = await a.newPage(), pb = await b.newPage();
  await completeIdentity(pa, `QA-A-${expectedSha.slice(0,6)}`);
  await completeIdentity(pb, `QA-B-${expectedSha.slice(0,6)}`, true);
  const ca = await pa.evaluate(() => localStorage.getItem('qiudazi_guest_credentials_v3'));
  const cb = await pb.evaluate(() => localStorage.getItem('qiudazi_guest_credentials_v3'));
  record('dual-user isolated browser sessions', !!ca && !!cb && ca !== cb, `A=${!!ca}, B=${!!cb}, distinct=${ca !== cb}`);
  await pa.screenshot({ path: path.join(outDir, 'dual-user-a.png'), fullPage: true });
  await pb.screenshot({ path: path.join(outDir, 'dual-user-b.png'), fullPage: true });
  await a.close(); await b.close(); await browser.close();
}

try {
  await waitForExactDeployment();
  await assertMobileShell(chromium, { width: 375, height: 812 }, 'chromium-375');
  await assertMobileShell(chromium, { width: 390, height: 844 }, 'chromium-390');
  await assertMobileShell(chromium, { width: 430, height: 932 }, 'chromium-430');
  await assertMobileShell(webkit, { width: 390, height: 844 }, 'webkit-iphone-390');
  await assertMobileShell(webkit, { width: 390, height: 844 }, 'webkit-english', 'en');
  await assertDualSession();
  results.ok = true;
} catch (e) {
  results.ok = false;
  results.error = e instanceof Error ? e.stack || e.message : String(e);
  throw e;
} finally {
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
}
