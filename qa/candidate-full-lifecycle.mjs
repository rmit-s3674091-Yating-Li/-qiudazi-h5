import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN || '';
if (!baseUrl || !expectedSha) throw new Error('BASE_URL and EXPECTED_SHA are required');
// Vercel OIDC is used only for the direct exact-head preflight. Do not inject
// this header into Playwright contexts because browser cross-origin Supabase
// requests would inherit it and fail CORS preflight.
const vercelProtectionHeaders = oidcToken ? { 'x-vercel-trusted-oidc-idp-token': oidcToken } : {};
const outDir = path.join(process.cwd(), 'qa-artifacts');
fs.mkdirSync(outDir, { recursive: true });
const resultPath = path.join(outDir, 'full-lifecycle-result.json');
const results = { baseUrl, expectedSha, authMode: oidcToken ? 'github-oidc-preflight-only' : 'public-preview', previewRuntimeIsolation: 'vercel-toolbar-blocked', startedAt: new Date().toISOString(), checks: [], evidence: {} };
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSMAAAAASUVORK5CYII=', 'base64');
const rawLeak = /(column reference|sqlstate|postgres|relation .* does not exist|violates .* constraint|jwt|rls|rpc\b|ambiguous)/i;

function record(name, ok, details = '') { results.checks.push({ name, ok, details }); if (!ok) throw new Error(`${name}: ${details}`); }
function pad(n) { return String(n).padStart(2, '0'); }
function futureDate(days) { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function labelInput(page, text) { return page.locator('label').filter({ hasText: text }).locator('input,select').first(); }
async function shot(page, name) { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); }
async function noLeak(page, name) { const text = await page.locator('body').innerText(); record(`${name} no raw backend leakage`, !rawLeak.test(text), text.match(rawLeak)?.[0] || 'clean'); }
async function confirm(page) { await page.getByRole('button', { name: 'Confirm', exact: true }).last().click(); }
async function waitButton(page, name, timeout = 30000) { const b = page.getByRole('button', { name, exact: true }); await b.waitFor({ state: 'visible', timeout }); return b; }

async function exactHead() {
  const deadline = Date.now() + 8 * 60000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(new URL('/build-meta.json', baseUrl), { cache: 'no-store', headers: vercelProtectionHeaders, redirect: 'follow' });
      if (r.ok && (r.headers.get('content-type') || '').includes('application/json')) {
        const meta = await r.json(); last = JSON.stringify(meta);
        if (meta.sha === expectedSha && meta.ref === 'release-candidate') { results.evidence.buildMeta = meta; record('full-lifecycle exact-head deployment reached', true, last); return; }
      } else last = `HTTP ${r.status}`;
    } catch (e) { last = String(e); }
    await new Promise(r => setTimeout(r, 5000));
  }
  record('full-lifecycle exact-head deployment reached', false, `expected=${expectedSha}; last=${last}`);
}

async function englishContext(browser, traceName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await context.route(/^https:\/\/vercel\.live\//, route => route.abort('blockedbyclient'));
  await context.addInitScript(() => localStorage.setItem('qiudazi-language', 'en'));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  context.__traceName = traceName;
  return context;
}
async function closeContext(context) { await context.tracing.stop({ path: path.join(outDir, `${context.__traceName}.zip`) }); await context.close(); }

async function shellReady(page, timeout = 8000) {
  try {
    await page.locator('a[href="#/quick-start"]').first().waitFor({ state: 'visible', timeout });
    const body = await page.locator('body').innerText();
    return !/online database is not configured|当前没有配置在线数据库|Restoring your Qiu Dazi identity|正在恢复你的球搭子身份/i.test(body);
  } catch {
    return false;
  }
}

async function identity(page, nickname) {
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'domcontentloaded' });
  let lastBody = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.waitForTimeout(900);
    if (page.url().includes('/profile')) {
      const input = page.locator('input[autocomplete="nickname"]');
      await input.waitFor({ state: 'visible', timeout: 20000 });
      await input.fill(nickname);
      const consent = page.locator('input[type=checkbox]').first(); if (await consent.count()) await consent.check();
      await page.locator('button[type=submit], button.full').filter({ hasText: /Start playing|Continue|开始打球|继续/ }).first().click();
      try { await page.waitForURL(/#\/events(?:$|\?)/, { timeout: 30000 }); } catch {}
    }

    if (await shellReady(page, 8000)) {
      const body = await page.locator('body').innerText();
      record(`real browser identity ready: ${nickname}`, true, `attempt=${attempt}; ${body.slice(0, 160)}`);
      return;
    }

    lastBody = await page.locator('body').innerText().catch(() => '');
    const restore = page.getByRole('button', { name: /Retry connection|重试连接/i });
    if (await restore.count()) {
      await restore.first().click();
      await page.waitForTimeout(1500);
    } else if (attempt < 3) {
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  record(`real browser identity ready: ${nickname}`, false, lastBody.slice(0, 240));
}

async function deadlineAutoCustom(browser) {
  const c = await englishContext(browser, 'deadline-auto-custom-trace'); const p = await c.newPage();
  await identity(p, `QA-Deadline-${expectedSha.slice(0,6)}`);
  await p.goto(`${baseUrl}/#/events/new`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /Time & venue/i }).click();
  const date = labelInput(p, 'Match date'), time = labelInput(p, 'Start time'), deadline = labelInput(p, 'Registration deadline');
  const day = futureDate(9); await date.fill(day); await time.fill('20:00'); await p.waitForTimeout(150);
  const a = await deadline.inputValue(); record('AUD-005 automatic deadline initializes T-2h', a.endsWith('18:00'), a);
  await time.fill('21:00'); await p.waitForTimeout(150); const b = await deadline.inputValue();
  record('AUD-005 automatic deadline follows changed start time', b.endsWith('19:00') && b !== a, `${a} -> ${b}`);
  const manual = `${day}T17:00`; await deadline.fill(manual); await time.fill('22:00'); await p.waitForTimeout(150); const kept = await deadline.inputValue();
  record('AUD-005 manual earlier deadline remains manual', kept === manual, `${manual} -> ${kept}`);
  await shot(p, 'deadline-auto-custom'); await closeContext(c);
}

async function privacyPersistence(browser) {
  const c = await englishContext(browser, 'privacy-persistence-trace'); const p = await c.newPage();
  await identity(p, `QA-Privacy-${expectedSha.slice(0,6)}`); await p.goto(`${baseUrl}/#/privacy`, { waitUntil: 'domcontentloaded' });
  const only = p.getByRole('button', { name: 'Only me', exact: true }), partners = p.getByRole('button', { name: 'Partners', exact: true });
  await only.waitFor({ state: 'visible', timeout: 20000 });
  const original = ((await only.getAttribute('class')) || '').includes('active') ? 'private' : 'partners';
  await (original === 'private' ? partners : only).click(); await p.getByRole('button', { name: 'Save settings', exact: true }).click();
  await p.getByRole('button', { name: 'Settings saved', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await p.reload({ waitUntil: 'domcontentloaded' }); await only.waitFor({ state: 'visible', timeout: 20000 });
  const cls = await (original === 'private' ? partners : only).getAttribute('class');
  record('AUD-20260830-003 settings/privacy persists strict allowed payload', (cls || '').includes('active'), `original=${original}`); await noLeak(p, 'privacy settings');
  await (original === 'private' ? only : partners).click(); await p.getByRole('button', { name: 'Save settings', exact: true }).click();
  await p.getByRole('button', { name: 'Settings saved', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await shot(p, 'privacy-persistence'); await closeContext(c);
}

async function quickRecovery(browser) {
  const c = await englishContext(browser, 'quick-start-recovery-trace'); const p = await c.newPage();
  await identity(p, `QA-Quick-${expectedSha.slice(0,6)}`); await p.goto(`${baseUrl}/#/quick-start`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: 'Choose players', exact: true }).click(); const add = p.getByPlaceholder('Add a temporary player');
  await add.fill(`Temp-${expectedSha.slice(0,5)}`); await add.locator('xpath=following-sibling::button').click(); await add.waitFor({ state: 'visible' });
  await p.getByRole('button', { name: 'Match setup', exact: true }).click(); await labelInput(p, 'City *').fill('QA City');
  let aborted = false; await p.route('**/functions/v1/tournament-command', async route => { if (!aborted) { aborted = true; await route.abort('failed'); } else await route.continue(); });
  await p.getByRole('button', { name: 'Create draw', exact: true }).click(); await p.getByRole('heading', { name: 'Event created', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const pending = await p.evaluate(() => sessionStorage.getItem('qiudazi-pending-quick-draw')); const parsed = pending ? JSON.parse(pending) : null;
  record('AUD-006 draw failure preserves already-created quick event', !!parsed?.id && typeof parsed.version === 'number', pending || 'missing'); results.evidence.quickRecoveryEventId = parsed?.id;
  await shot(p, 'quick-start-draw-failure'); await p.unroute('**/functions/v1/tournament-command'); await p.getByRole('button', { name: 'Retry draw', exact: true }).click();
  await p.waitForURL(new RegExp(`#\\/events\\/${parsed.id}\\/manage`), { timeout: 30000 }); const after = await p.evaluate(() => sessionStorage.getItem('qiudazi-pending-quick-draw'));
  record('AUD-006 retry reuses same event and clears recovery key', after === null && p.url().includes(parsed.id), `url=${p.url()}, pending=${after}`); await waitButton(p, 'Start event'); await noLeak(p, 'Quick Start recovery');
  await shot(p, 'quick-start-recovered'); await closeContext(c);
}

async function createEvent(p, name) {
  await p.goto(`${baseUrl}/#/events/new`, { waitUntil: 'domcontentloaded' }); await labelInput(p, 'Event name').fill(name); await p.getByRole('button', { name: /Time & venue/i }).click();
  await labelInput(p, 'Entry limit').fill('2'); await labelInput(p, 'Match date').fill(futureDate(10)); await labelInput(p, 'Start time').fill('20:00'); await labelInput(p, 'City *').fill('QA City'); await labelInput(p, 'Venue').fill('QA Court');
  await p.getByRole('button', { name: 'Create event', exact: true }).click(); await p.waitForURL(/#\/events\/[0-9a-f-]+\/manage/, { timeout: 30000 }); return p.url().match(/#\/events\/([0-9a-f-]+)\/manage/)?.[1];
}
async function register(p, owner) {
  await p.getByRole('button', { name: owner ? 'Register myself' : 'Register now', exact: true }).click(); await p.getByRole('button', { name: 'Confirm registration', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await p.getByRole('button', { name: 'Confirm registration', exact: true }).click(); await p.getByText(/Registered · view \/ withdraw/).waitFor({ state: 'visible', timeout: 30000 });
}

async function standardLifecyclePhoto(browser) {
  const owner = await englishContext(browser, 'standard-owner-trace'), participant = await englishContext(browser, 'standard-participant-trace');
  const o = await owner.newPage(), u = await participant.newPage(); await identity(o, `QA-Owner-${expectedSha.slice(0,6)}`); await identity(u, `QA-Player-${expectedSha.slice(0,6)}`);
  const name = `QA Lifecycle ${expectedSha.slice(0,7)} ${Date.now().toString().slice(-5)}`, id = await createEvent(o, name); record('P0 standard event created through real UI', !!id, o.url()); results.evidence.standardEventId = id;
  await register(o, true); await u.goto(`${baseUrl}/#/events/${id}`, { waitUntil: 'domcontentloaded' }); await u.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible', timeout: 20000 }); await register(u, false);
  record('P0 two real isolated users share the same event data', true, id);

  await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' }); await waitButton(o, 'Lock roster'); await o.getByRole('button', { name: 'Lock roster', exact: true }).click();
  await o.getByRole('heading', { name: 'Lock the roster and generate the draw?', exact: true }).waitFor({ state: 'visible', timeout: 10000 }); await confirm(o); await waitButton(o, 'Start event', 40000);
  record('AUD-007 one lock confirmation automatically generates initial draw', true, id); await o.getByRole('button', { name: 'View draw', exact: true }).click(); const matches = await o.locator('.match-card').count(); record('AUD-013 generated draw contains a real match', matches > 0, `matches=${matches}`); await shot(o, 'standard-auto-draw');

  await u.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' }); await u.getByText('Only the event organizer can manage this event.').waitFor({ state: 'visible', timeout: 20000 }); record('P0 participant cannot use organizer management CTA', await u.getByRole('button', { name: 'Start event', exact: true }).count() === 0, 'owner action absent');

  await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' }); await waitButton(o, 'Start event'); await o.getByRole('button', { name: 'Start event', exact: true }).click(); await confirm(o); await waitButton(o, 'Finish event', 30000);
  await o.getByRole('button', { name: 'Draw', exact: true }).click(); await o.locator('.match-card').filter({ hasNotText: 'Bye' }).first().click(); await o.getByRole('link', { name: 'Enter final score', exact: true }).click();
  await o.getByLabel('Set 1 side A score').fill('6'); await o.getByLabel('Set 1 side B score').fill('0'); await o.getByRole('button', { name: 'Save final score', exact: true }).click(); await o.waitForURL(new RegExp(`#\\/events\\/${id}\\/matches\\/`), { timeout: 30000 });
  record('P0 organizer saves real match score through browser UI', await o.getByText('6', { exact: true }).count() > 0, o.url());

  await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' }); await o.getByRole('button', { name: 'Standings', exact: true }).click(); await shot(o, 'standard-standings-after-score');
  await o.getByRole('button', { name: 'Finish event', exact: true }).click(); await confirm(o); await o.getByText('Finished', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 }); record('P0 event reaches finished lifecycle', true, id);

  await o.getByRole('button', { name: 'Photo', exact: true }).click(); await o.locator('input[type=file][multiple]').setInputFiles({ name: 'qa-event.png', mimeType: 'image/png', buffer: tinyPng }); await o.getByRole('button', { name: 'Delete photo', exact: true }).waitFor({ state: 'visible', timeout: 40000 });
  record('AUD-017 organizer uploads protected source photo using real file input', true, id); await shot(o, 'event-photo-owner-uploaded');
  await u.goto(`${baseUrl}/#/events/${id}`, { waitUntil: 'domcontentloaded' }); await u.getByRole('button', { name: 'Photo', exact: true }).click(); await u.getByRole('button', { name: 'Add to my event album', exact: true }).waitFor({ state: 'visible', timeout: 30000 }); await u.getByRole('button', { name: 'Add to my event album', exact: true }).click(); await u.getByRole('button', { name: 'Added to my event album', exact: true }).waitFor({ state: 'visible', timeout: 40000 });
  record('AUD-017 actual participant imports independent personal photo copy', true, id); await noLeak(u, 'event photo participant view');
  await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' }); await o.getByRole('button', { name: 'Photo', exact: true }).click(); await o.getByRole('button', { name: 'Delete photo', exact: true }).click(); await o.getByRole('heading', { name: 'Delete this event photo?', exact: true }).waitFor({ state: 'visible', timeout: 10000 }); await confirm(o); await o.getByRole('heading', { name: 'No event photos yet', exact: true }).waitFor({ state: 'visible', timeout: 40000 });
  record('AUD-004/017 source photo delete completes without raw SQL ambiguity', true, id); await noLeak(o, 'event photo owner delete');
  await u.goto(`${baseUrl}/#/my-past-albums`, { waitUntil: 'domcontentloaded' }); await u.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible', timeout: 40000 }); record('AUD-017 personal copy survives organizer source deletion', true, name); await noLeak(u, 'personal album after source deletion'); await shot(u, 'personal-album-survives-source-delete');
  await closeContext(owner); await closeContext(participant);
}

const browser = await chromium.launch();
try {
  await exactHead();
  await deadlineAutoCustom(browser);
  await privacyPersistence(browser);
  await quickRecovery(browser);
  await standardLifecyclePhoto(browser);
  results.ok = true;
} catch (e) {
  results.ok = false; results.error = e instanceof Error ? e.stack || e.message : String(e); throw e;
} finally {
  results.finishedAt = new Date().toISOString(); fs.writeFileSync(resultPath, JSON.stringify(results, null, 2)); await browser.close();
}
