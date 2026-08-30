import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN || '';
if (!baseUrl || !expectedSha) throw new Error('BASE_URL and EXPECTED_SHA are required');

// OIDC is valid only for direct Vercel protection checks. Never inject it into
// a browser context: extraHTTPHeaders are also sent to cross-origin Supabase
// requests and would cause CORS preflight failures.
const vercelProtectionHeaders = oidcToken
  ? { 'x-vercel-trusted-oidc-idp-token': oidcToken }
  : {};

const outDir = path.join(process.cwd(), 'qa-artifacts');
fs.mkdirSync(outDir, { recursive: true });
const results = {
  baseUrl,
  expectedSha,
  authMode: oidcToken ? 'github-oidc-preflight-only' : 'public-preview',
  previewRuntimeIsolation: 'vercel-toolbar-blocked',
  startedAt: new Date().toISOString(),
  checks: [],
  diagnostics: [],
};
let failed = false;
const record = (name, ok, details = '') => {
  results.checks.push({ name, ok, details });
  if (!ok) failed = true;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function isolateVercelPreviewRuntime(context) {
  // Vercel Preview appends https://vercel.live/_next-live/feedback/feedback.js
  // outside the deployed application HTML. It is not product code and has
  // produced WebKit-only navigator.storage errors that cannot occur in the
  // production bundle. Block only that injected runtime so this blackbox
  // validates the release candidate itself and all real Supabase traffic.
  await context.route(/^https:\/\/vercel\.live\//, route => route.abort('blockedbyclient'));
}

async function waitForExactDeployment() {
  const deadline = Date.now() + 6 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(new URL('/build-meta.json', baseUrl), {
        cache: 'no-store',
        headers: vercelProtectionHeaders,
        redirect: 'follow',
      });
      const contentType = r.headers.get('content-type') || '';
      if (r.ok && contentType.includes('application/json')) {
        const meta = await r.json();
        last = JSON.stringify(meta);
        if (meta.sha === expectedSha && meta.ref === 'release-candidate') {
          record('exact-head deployment reached', true, last);
          return;
        }
      } else {
        const body = await r.text();
        last = `HTTP ${r.status} ${contentType}; body=${body.slice(0, 120).replace(/\s+/g, ' ')}`;
      }
    } catch (e) { last = String(e); }
    await sleep(5000);
  }
  record('exact-head deployment reached', false, `expected ${expectedSha}; auth=${results.authMode}; last=${last}`);
  throw new Error(`exact-head deployment unavailable: ${last}`);
}

function contextOptions(viewport, language = 'zh') {
  return {
    viewport,
    locale: language === 'en' ? 'en-US' : 'zh-CN',
  };
}

function attachDiagnostics(page, label) {
  page.on('pageerror', error => {
    results.diagnostics.push({ label, kind: 'pageerror', message: String(error) });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') results.diagnostics.push({ label, kind: 'console.error', message: msg.text().slice(0, 800) });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (/supabase|functions\/v1|auth\/v1/i.test(url)) {
      results.diagnostics.push({ label, kind: 'requestfailed', url, message: request.failure()?.errorText || 'unknown' });
    }
  });
  page.on('response', async response => {
    const url = response.url();
    if (response.status() >= 400 && /supabase|functions\/v1|auth\/v1/i.test(url)) {
      let body = '';
      try { body = (await response.text()).slice(0, 800); } catch {}
      results.diagnostics.push({ label, kind: 'http-error', status: response.status(), url, body });
    }
  });
}

async function businessShellReady(page, timeout = 20_000) {
  try {
    await page.locator('a.quick-start-fab[href="#/quick-start"], a[href="#/quick-start"][aria-label]').first()
      .waitFor({ state: 'visible', timeout });
    const text = await page.locator('body').innerText();
    return !/正在恢复你的球搭子身份|Restoring your Qiu Dazi identity/i.test(text);
  } catch {
    return false;
  }
}

async function completeIdentity(page, nickname, withUpload = false, label = nickname) {
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'domcontentloaded' });

  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(900);

    if (page.url().includes('/profile')) {
      const nicknameInput = page.locator('input[autocomplete="nickname"]');
      await nicknameInput.waitFor({ state: 'visible', timeout: 20_000 });
      await nicknameInput.fill(nickname);
      if (withUpload) {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSMAAAAASUVORK5CYII=', 'base64');
        const upload = page.locator('input[type=file]').first();
        if (await upload.count()) await upload.setInputFiles({ name: 'qa-avatar.png', mimeType: 'image/png', buffer: png });
      }
      const consent = page.locator('input[type=checkbox]').first();
      if (await consent.count()) await consent.check();
      await page.locator('button[type=submit], button.full').filter({ hasText: /开始打球|Start playing|继续|Continue/ }).first().click();
      try { await page.waitForURL(/#\/events(?:$|\?)/, { timeout: 30_000 }); } catch {}
    }

    if (await businessShellReady(page, 8_000)) {
      const text = await page.locator('body').innerText();
      record(`identity ready: ${nickname}`, !/当前没有配置在线数据库|online database is not configured/i.test(text), `attempt=${attempt}; ${text.slice(0, 180)}`);
      return true;
    }

    const text = await page.locator('body').innerText();
    const retry = page.getByRole('button', { name: /重试连接|Retry connection/i });
    if (await retry.count()) {
      results.diagnostics.push({ label, kind: 'identity-retry', attempt, body: text.slice(0, 500) });
      await page.screenshot({ path: path.join(outDir, `${label}-identity-retry-${attempt}.png`), fullPage: true });
      await retry.first().click();
      await sleep(1500);
      continue;
    }

    results.diagnostics.push({ label, kind: 'identity-not-ready', attempt, url: page.url(), body: text.slice(0, 500) });
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  const finalText = await page.locator('body').innerText().catch(() => '');
  await page.screenshot({ path: path.join(outDir, `${label}-identity-failed.png`), fullPage: true }).catch(() => {});
  record(`identity ready: ${nickname}`, false, `url=${page.url()}; ${finalText.slice(0, 300)}`);
  return false;
}

async function assertMobileShell(browserType, viewport, label, language = 'zh') {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions(viewport, language));
  await isolateVercelPreviewRuntime(context);
  if (language === 'en') await context.addInitScript(() => localStorage.setItem('qiudazi-language', 'en'));
  const page = await context.newPage();
  attachDiagnostics(page, label);

  try {
    const identityReady = await completeIdentity(page, `QA-${label}-${expectedSha.slice(0,6)}`, false, label);
    if (!identityReady) {
      record(`${label} business shell reached`, false, 'identity did not reach normal business state');
      return;
    }

    // completeIdentity already leaves the page on the normal events shell.
    // A second goto here cancels in-flight Supabase requests on WebKit and
    // creates a test-only navigation race, so validate the settled page.
    const shellReady = await businessShellReady(page, 20_000);
    record(`${label} business shell reached`, shellReady, `url=${page.url()}`);
    if (!shellReady) {
      await page.screenshot({ path: path.join(outDir, `${label}-shell-not-ready.png`), fullPage: true });
      return;
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record(`${label} no horizontal overflow`, overflow <= 1, `overflow=${overflow}`);

    const quick = page.locator('a.quick-start-fab[href="#/quick-start"], a[href="#/quick-start"][aria-label]').first();
    const count = await quick.count();
    const visible = count > 0 && await quick.isVisible();
    const box = visible ? await quick.boundingBox() : null;
    record(`${label} quick-start visible in viewport`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `count=${count}; visible=${visible}; box=${JSON.stringify(box)}`);

    const navTargets = ['#/events', '#/my-events', '#/players', '#/me'];
    for (const target of navTargets) record(`${label} nav ${target}`, await page.locator(`a[href="${target}"]`).count() > 0);
    if (language === 'en') record(`${label} English quick action`, await page.locator('[aria-label="Quick start"]').count() > 0);
    await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  } catch (error) {
    record(`${label} unexpected browser-shell exception`, false, error instanceof Error ? error.stack || error.message : String(error));
    await page.screenshot({ path: path.join(outDir, `${label}-exception.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
}

async function assertDualSession() {
  const browser = await chromium.launch();
  const a = await browser.newContext(contextOptions({ width: 390, height: 844 }));
  const b = await browser.newContext(contextOptions({ width: 390, height: 844 }));
  await isolateVercelPreviewRuntime(a);
  await isolateVercelPreviewRuntime(b);
  const pa = await a.newPage(), pb = await b.newPage();
  attachDiagnostics(pa, 'dual-user-a');
  attachDiagnostics(pb, 'dual-user-b');
  try {
    const readyA = await completeIdentity(pa, `QA-A-${expectedSha.slice(0,6)}`, false, 'dual-user-a');
    const readyB = await completeIdentity(pb, `QA-B-${expectedSha.slice(0,6)}`, true, 'dual-user-b');
    if (!readyA || !readyB) {
      record('dual-user isolated browser sessions', false, `readyA=${readyA}, readyB=${readyB}`);
      return;
    }
    const ca = await pa.evaluate(() => localStorage.getItem('qiudazi_guest_credentials_v3'));
    const cb = await pb.evaluate(() => localStorage.getItem('qiudazi_guest_credentials_v3'));
    record('dual-user isolated browser sessions', !!ca && !!cb && ca !== cb, `A=${!!ca}, B=${!!cb}, distinct=${ca !== cb}`);
    await pa.screenshot({ path: path.join(outDir, 'dual-user-a.png'), fullPage: true });
    await pb.screenshot({ path: path.join(outDir, 'dual-user-b.png'), fullPage: true });
  } catch (error) {
    record('dual-user unexpected exception', false, error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    await a.close(); await b.close(); await browser.close();
  }
}

try {
  await waitForExactDeployment();
  await assertMobileShell(chromium, { width: 375, height: 812 }, 'chromium-375');
  await assertMobileShell(chromium, { width: 390, height: 844 }, 'chromium-390');
  await assertMobileShell(chromium, { width: 430, height: 932 }, 'chromium-430');
  await assertMobileShell(webkit, { width: 390, height: 844 }, 'webkit-iphone-390');
  await assertMobileShell(webkit, { width: 390, height: 844 }, 'webkit-english', 'en');
  await assertDualSession();
  results.ok = !failed && results.checks.every(check => check.ok);
  if (!results.ok) throw new Error(`Browser blackbox recorded ${results.checks.filter(check => !check.ok).length} failed checks`);
} catch (e) {
  results.ok = false;
  results.error = e instanceof Error ? e.stack || e.message : String(e);
  process.exitCode = 1;
} finally {
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
}
