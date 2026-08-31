import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN || '';
if (!baseUrl || !expectedSha) throw new Error('BASE_URL and EXPECTED_SHA are required');

const outDir = path.join(process.cwd(), 'qa-artifacts-exploratory');
fs.mkdirSync(outDir, { recursive: true });
const resultPath = path.join(outDir, 'exploratory-result.json');
const vercelHeaders = oidcToken ? { 'x-vercel-trusted-oidc-idp-token': oidcToken } : {};
const results = {
  mode: 'exploratory-non-fail-fast',
  baseUrl,
  expectedSha,
  startedAt: new Date().toISOString(),
  scenarios: [],
  findings: [],
  evidence: {},
};

function pad(n) { return String(n).padStart(2, '0'); }
function futureDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function labelInput(page, text) {
  return page.locator('label').filter({ hasText: text }).locator('input,select').first();
}
async function shot(page, name) {
  try { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); } catch {}
}
async function newContext(browser, name, locale = 'en-US', viewport = { width: 390, height: 844 }) {
  const c = await browser.newContext({ viewport, locale });
  await c.route(/^https:\/\/vercel\.live\//, r => r.abort('blockedbyclient'));
  await c.addInitScript(() => localStorage.setItem('qiudazi-language', 'en'));
  await c.tracing.start({ screenshots: true, snapshots: true, sources: true });
  c.__traceName = name;
  return c;
}
async function closeContext(c) {
  try { await c.tracing.stop({ path: path.join(outDir, `${c.__traceName}.zip`) }); } catch {}
  try { await c.close(); } catch {}
}
async function identity(page, nickname) {
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(800);
    if (page.url().includes('/profile')) {
      const input = page.locator('input[autocomplete="nickname"]');
      await input.waitFor({ state: 'visible', timeout: 20000 });
      await input.fill(nickname);
      const consent = page.locator('input[type=checkbox]').first();
      if (await consent.count()) await consent.check();
      await page.locator('button[type=submit],button.full').filter({ hasText: /Start playing|Continue|开始打球|继续/ }).first().click();
      try { await page.waitForURL(/#\/events(?:$|\?)/, { timeout: 30000 }); } catch {}
    }
    try {
      await page.locator('a[href="#/quick-start"]').first().waitFor({ state: 'visible', timeout: 7000 });
      return;
    } catch {}
    const retry = page.getByRole('button', { name: /Retry connection|重试连接/i });
    if (await retry.count()) await retry.first().click();
    else if (i < 3) await page.reload({ waitUntil: 'domcontentloaded' });
  }
  throw new Error(`identity not ready for ${nickname}`);
}
async function confirm(page) {
  await page.getByRole('button', { name: 'Confirm', exact: true }).last().click();
}
async function runScenario(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const evidence = await fn();
    results.scenarios.push({ name, ok: true, startedAt, finishedAt: new Date().toISOString(), evidence: evidence || null });
  } catch (e) {
    const message = e instanceof Error ? (e.stack || e.message) : String(e);
    results.scenarios.push({ name, ok: false, startedAt, finishedAt: new Date().toISOString(), error: message });
    results.findings.push({ scenario: name, error: message });
  }
}

async function verifyExactHead() {
  const r = await fetch(new URL('/build-meta.json', baseUrl), { cache: 'no-store', headers: vercelHeaders, redirect: 'follow' });
  if (!r.ok) throw new Error(`build-meta HTTP ${r.status}`);
  const meta = await r.json();
  results.evidence.buildMeta = meta;
  if (meta.sha !== expectedSha || meta.ref !== 'release-candidate') {
    throw new Error(`exact-head mismatch expected=${expectedSha}/release-candidate got=${meta.sha}/${meta.ref}`);
  }
}

async function scenarioDeadline(browser) {
  const c = await newContext(browser, 'explore-deadline');
  const p = await c.newPage();
  try {
    await identity(p, `EXP-Deadline-${expectedSha.slice(0, 6)}`);
    await p.goto(`${baseUrl}/#/events/new`, { waitUntil: 'domcontentloaded' });
    await p.getByRole('button', { name: /Time & venue/i }).click();
    const date = labelInput(p, 'Match date');
    const time = labelInput(p, 'Start time');
    const deadline = labelInput(p, 'Registration deadline');
    const day = futureDate(9);
    await date.fill(day); await time.fill('20:00'); await p.waitForTimeout(150);
    const a = await deadline.inputValue();
    if (!a.endsWith('18:00')) throw new Error(`automatic T-2h mismatch: ${a}`);
    await time.fill('21:00'); await p.waitForTimeout(150);
    const b = await deadline.inputValue();
    if (!b.endsWith('19:00') || b === a) throw new Error(`deadline did not follow start time: ${a} -> ${b}`);
    const manual = `${day}T17:00`; await deadline.fill(manual); await time.fill('22:00'); await p.waitForTimeout(150);
    const kept = await deadline.inputValue();
    if (kept !== manual) throw new Error(`manual deadline overwritten: ${manual} -> ${kept}`);
    await shot(p, 'explore-deadline-pass');
    return { automatic: a, updated: b, manual: kept };
  } finally { await closeContext(c); }
}

async function scenarioPrivacy(browser) {
  const c = await newContext(browser, 'explore-privacy');
  const p = await c.newPage();
  try {
    await identity(p, `EXP-Privacy-${expectedSha.slice(0, 6)}`);
    await p.goto(`${baseUrl}/#/privacy`, { waitUntil: 'domcontentloaded' });
    const only = p.getByRole('button', { name: 'Only me', exact: true });
    const partners = p.getByRole('button', { name: 'Partners', exact: true });
    await only.waitFor({ state: 'visible', timeout: 20000 });
    const original = ((await only.getAttribute('class')) || '').includes('active') ? 'private' : 'partners';
    await (original === 'private' ? partners : only).click();
    await p.getByRole('button', { name: 'Save settings', exact: true }).click();
    await p.getByRole('button', { name: 'Settings saved', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await only.waitFor({ state: 'visible', timeout: 20000 });
    const cls = await (original === 'private' ? partners : only).getAttribute('class');
    if (!(cls || '').includes('active')) throw new Error(`privacy setting did not persist; original=${original}`);
    await shot(p, 'explore-privacy-pass');
    return { original, toggledTo: original === 'private' ? 'partners' : 'private' };
  } finally { await closeContext(c); }
}

async function scenarioQuickRecovery(browser) {
  const c = await newContext(browser, 'explore-quick-recovery');
  const p = await c.newPage();
  try {
    await identity(p, `EXP-Quick-${expectedSha.slice(0, 6)}`);
    await p.goto(`${baseUrl}/#/quick-start`, { waitUntil: 'domcontentloaded' });
    await p.getByRole('button', { name: 'Choose players', exact: true }).click();
    const add = p.getByPlaceholder('Add a temporary player');
    await add.fill(`EXP-${Date.now().toString().slice(-5)}`);
    await add.locator('xpath=following-sibling::button').click();
    await p.getByRole('button', { name: 'Match setup', exact: true }).click();
    await labelInput(p, 'City *').fill('QA City');
    let aborted = false;
    await p.route('**/functions/v1/tournament-command', async route => {
      if (!aborted) { aborted = true; await route.abort('failed'); }
      else await route.continue();
    });
    await p.getByRole('button', { name: 'Create draw', exact: true }).click();
    await p.getByRole('heading', { name: 'Event created', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const pending = await p.evaluate(() => sessionStorage.getItem('qiudazi-pending-quick-draw'));
    const parsed = pending ? JSON.parse(pending) : null;
    if (!parsed?.id || typeof parsed.version !== 'number') throw new Error(`quick recovery key missing: ${pending}`);
    await p.unroute('**/functions/v1/tournament-command');
    await p.getByRole('button', { name: 'Retry draw', exact: true }).click();
    await p.waitForURL(new RegExp(`#\\/events\\/${parsed.id}\\/manage`), { timeout: 30000 });
    const after = await p.evaluate(() => sessionStorage.getItem('qiudazi-pending-quick-draw'));
    if (after !== null) throw new Error(`quick recovery key not cleared: ${after}`);
    await p.getByRole('button', { name: 'Start event', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    await shot(p, 'explore-quick-recovery-pass');
    return { eventId: parsed.id };
  } finally { await closeContext(c); }
}

async function createStandardEvent(p, name) {
  await p.goto(`${baseUrl}/#/events/new`, { waitUntil: 'domcontentloaded' });
  await labelInput(p, 'Event name').fill(name);
  await p.getByRole('button', { name: /Time & venue/i }).click();
  await labelInput(p, 'Entry limit').fill('2');
  await labelInput(p, 'Match date').fill(futureDate(10));
  await labelInput(p, 'Start time').fill('20:00');
  await labelInput(p, 'City *').fill('QA City');
  await labelInput(p, 'Venue').fill('QA Court');
  await p.getByRole('button', { name: 'Create event', exact: true }).click();
  await p.waitForURL(/#\/events\/[0-9a-f-]+\/manage/, { timeout: 30000 });
  const id = p.url().match(/#\/events\/([0-9a-f-]+)\/manage/)?.[1];
  if (!id) throw new Error(`event id not found after create: ${p.url()}`);
  return id;
}
async function register(p, owner) {
  await p.getByRole('button', { name: owner ? 'Register myself' : 'Register now', exact: true }).click();
  await p.getByRole('button', { name: 'Confirm registration', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await p.getByRole('button', { name: 'Confirm registration', exact: true }).click();
  await p.getByText(/Registered · view \/ withdraw/).waitFor({ state: 'visible', timeout: 30000 });
}
async function scenarioStandardLifecycle(browser) {
  const owner = await newContext(browser, 'explore-standard-owner');
  const participant = await newContext(browser, 'explore-standard-participant');
  const o = await owner.newPage(), u = await participant.newPage();
  let id = null;
  try {
    await identity(o, `EXP-Owner-${expectedSha.slice(0, 6)}`);
    await identity(u, `EXP-Player-${expectedSha.slice(0, 6)}`);
    const name = `EXP Lifecycle ${expectedSha.slice(0, 7)} ${Date.now().toString().slice(-5)}`;
    id = await createStandardEvent(o, name);
    await register(o, true);
    await u.goto(`${baseUrl}/#/events/${id}`, { waitUntil: 'domcontentloaded' });
    await u.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    await register(u, false);

    await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' });
    await o.getByRole('button', { name: 'Lock roster', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    await o.getByRole('button', { name: 'Lock roster', exact: true }).click();
    await confirm(o);
    await o.getByRole('button', { name: 'Start event', exact: true }).waitFor({ state: 'visible', timeout: 40000 });
    await o.getByRole('button', { name: 'Start event', exact: true }).click();
    await confirm(o);
    await o.getByRole('button', { name: 'Finish event', exact: true }).waitFor({ state: 'visible', timeout: 30000 });

    await o.getByRole('button', { name: 'Draw', exact: true }).click();
    await o.locator('.match-card').filter({ hasNotText: 'Bye' }).first().click();
    await o.getByRole('link', { name: 'Enter final score', exact: true }).click();
    const scoreUrl = o.url();
    const matchId = scoreUrl.match(new RegExp(`#\\/events\\/${id}\\/matches\\/([0-9a-f-]+)\\/score`))?.[1];
    if (!matchId) throw new Error(`match id missing from score URL: ${scoreUrl}`);
    const nums = o.locator('input[type=number]');
    await nums.nth(0).fill('6'); await nums.nth(1).fill('0');
    const scoreResponse = o.waitForResponse(r => r.url().includes('/functions/v1/tournament-command') && r.request().method() === 'POST', { timeout: 30000 });
    await o.getByRole('button', { name: 'Save final score', exact: true }).click();
    const response = await scoreResponse;
    if (!response.ok()) throw new Error(`score command HTTP ${response.status()}`);
    await o.waitForURL(new RegExp(`#\\/events\\/${id}\\/matches\\/${matchId}$`), { timeout: 30000 });

    await o.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' });
    await o.getByRole('button', { name: 'Finish event', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const finishResponse = o.waitForResponse(r => r.url().includes('/functions/v1/tournament-command') && r.request().method() === 'POST', { timeout: 30000 });
    await o.getByRole('button', { name: 'Finish event', exact: true }).click();
    await confirm(o);
    const finish = await finishResponse;
    if (!finish.ok()) throw new Error(`finish command HTTP ${finish.status()}`);
    await o.getByText('Finished', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    await shot(o, 'explore-standard-finished');
    return { eventId: id, matchId };
  } catch (e) {
    await shot(o, `explore-standard-failure-${id || 'unknown'}`);
    if (id) results.evidence.standardEventId = id;
    throw e;
  } finally {
    await closeContext(owner); await closeContext(participant);
  }
}

async function scenarioMobileAndWebkit(chromiumBrowser) {
  const evidence = [];
  for (const width of [375, 390, 430]) {
    const c = await newContext(chromiumBrowser, `explore-mobile-${width}`, 'en-US', { width, height: 844 });
    const p = await c.newPage();
    try {
      await identity(p, `EXP-M${width}-${expectedSha.slice(0, 5)}`);
      const quick = p.locator('a[href="#/quick-start"]').first();
      await quick.waitFor({ state: 'visible', timeout: 10000 });
      evidence.push({ engine: 'chromium', width, quickStartVisible: true });
    } finally { await closeContext(c); }
  }
  const wb = await webkit.launch({ headless: true });
  try {
    const c = await newContext(wb, 'explore-webkit-390', 'en-US', { width: 390, height: 844 });
    const p = await c.newPage();
    try {
      await identity(p, `EXP-WK-${expectedSha.slice(0, 5)}`);
      await p.locator('a[href="#/quick-start"]').first().waitFor({ state: 'visible', timeout: 10000 });
      evidence.push({ engine: 'webkit', width: 390, quickStartVisible: true });
    } finally { await closeContext(c); }
  } finally { await wb.close(); }
  return evidence;
}

await verifyExactHead();
const browser = await chromium.launch({ headless: true });
try {
  await runScenario('deadline-auto-custom', () => scenarioDeadline(browser));
  await runScenario('privacy-persistence', () => scenarioPrivacy(browser));
  await runScenario('quick-start-recovery', () => scenarioQuickRecovery(browser));
  await runScenario('standard-full-lifecycle-through-finish', () => scenarioStandardLifecycle(browser));
  await runScenario('mobile-and-webkit-shell', () => scenarioMobileAndWebkit(browser));
} finally {
  await browser.close();
  results.finishedAt = new Date().toISOString();
  results.passCount = results.scenarios.filter(x => x.ok).length;
  results.failCount = results.scenarios.filter(x => !x.ok).length;
  results.ok = results.failCount === 0;
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ mode: results.mode, passCount: results.passCount, failCount: results.failCount, findings: results.findings }, null, 2));
}

// Exploratory findings are evidence, not workflow-fatal. The release Gate remains
// controlled by Candidate Browser Blackbox. Exact-head/preflight failures above
// still throw before scenario execution and correctly fail the workflow.
