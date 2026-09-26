import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN || '';
if (!baseUrl || !expectedSha) throw new Error('BASE_URL and EXPECTED_SHA are required');
const vercelProtectionHeaders = oidcToken ? { 'x-vercel-trusted-oidc-idp-token': oidcToken } : {};
const outDir = path.join(process.cwd(), 'qa-artifacts-aud015');
fs.mkdirSync(outDir, { recursive: true });
const result = { baseUrl, expectedSha, startedAt: new Date().toISOString(), checks: [], evidence: {} };
function record(name, ok, details = '') { result.checks.push({ name, ok, details }); if (!ok) throw new Error(`${name}: ${details}`); }
function pad(n) { return String(n).padStart(2, '0'); }
function futureDate(days) { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function labelInput(page, text) { return page.locator('label').filter({ hasText: text }).locator('input,select').first(); }
async function shot(page, name) { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); }
async function waitForLoadedInput(page, text) { const input = labelInput(page, text); await input.waitFor({ state: 'visible', timeout: 30000 }); await page.waitForFunction((labelText) => { const i = [...document.querySelectorAll('label')].find(x => x.textContent?.includes(labelText))?.querySelector('input,select'); return !!i?.value; }, text, { timeout: 30000 }); return input; }

const evidenceId = 'SK:legacy-015-doubles-withdrawal [AUD-20260829-015]';

async function exactHead() {
  const r = await fetch(new URL('/build-meta.json', baseUrl), { cache: 'no-store', headers: vercelProtectionHeaders });
  const meta = await r.json();
  record(`${evidenceId} exact-head release-candidate Preview`, r.ok && meta.sha === expectedSha && meta.ref === 'release-candidate', JSON.stringify(meta));
  result.evidence.buildMeta = meta;
}

async function context(browser, traceName) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await c.route(/^https:\/\/vercel\.live\//, route => route.abort('blockedbyclient'));
  await c.addInitScript(() => localStorage.setItem('qiudazi-language', 'en'));
  await c.tracing.start({ screenshots: true, snapshots: true, sources: true });
  c.__traceName = traceName;
  return c;
}
async function closeContext(c) { await c.tracing.stop({ path: path.join(outDir, `${c.__traceName}.zip`) }); await c.close(); }

async function shellReady(page, timeout = 20000) {
  try {
    await page.locator('a[href="#/quick-start"]').first().waitFor({ state: 'visible', timeout });
    const body = await page.locator('body').innerText();
    return !/online database is not configured|Restoring your Qiu Dazi identity/i.test(body);
  } catch { return false; }
}

async function identity(page, nickname) {
  await page.goto(`${baseUrl}/#/events`, { waitUntil: 'domcontentloaded' });
  let lastBody = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (page.url().includes('/profile')) {
      const input = page.locator('input[autocomplete="nickname"]');
      await input.waitFor({ state: 'visible', timeout: 20000 });
      await input.fill(nickname);
      const consent = page.locator('input[type=checkbox]').first(); if (await consent.count()) await consent.check();
      await page.locator('button[type=submit], button.full').filter({ hasText: /Start playing|Continue/ }).first().click();
      try { await page.waitForURL(/#\/events(?:$|\?)/, { timeout: 30000 }); } catch {}
    }
    if (await shellReady(page, 20000)) { record(`identity ready: ${nickname}`, true, `attempt=${attempt}`); return; }
    lastBody = await page.locator('body').innerText().catch(() => '');
    const retry = page.getByRole('button', { name: 'Retry connection' });
    if (await retry.count()) {
      await shot(page, `identity-retry-${nickname}-${attempt}`).catch(() => {});
      await retry.first().click();
      await page.waitForTimeout(2000);
      continue;
    }
    // Do not reload while guest-session/auth/profile recovery may still be in flight.
    // Reloading can abort the exact request chain this specialist harness is verifying.
    if (attempt < 3) await page.waitForTimeout(2500);
  }
  await shot(page, `identity-failed-${nickname}`).catch(() => {});
  record(`identity ready: ${nickname}`, false, lastBody.slice(0, 220));
}

async function connect(owner, partner, ownerName, partnerName) {
  await owner.goto(`${baseUrl}/#/players`, { waitUntil: 'domcontentloaded' });
  const responsePromise = owner.waitForResponse(r => r.url().includes('/rest/v1/rpc/create_connection_invite') && r.request().method() === 'POST', { timeout: 30000 });
  await owner.getByRole('button', { name: 'Invite partner', exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json();
  const token = Array.isArray(payload) ? payload[0]?.token : payload?.token;
  record(`${evidenceId} real users create a partner connection invitation`, response.ok() && !!token, `status=${response.status()}; token=${token || 'missing'}`);
  await partner.goto(`${baseUrl}/?connect=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  await partner.getByText(/already partners/i).first().waitFor({ state: 'visible', timeout: 30000 });
  record(`${evidenceId} two real identities are connected before doubles invite`, true, `${ownerName} <-> ${partnerName}`);
}

async function createDoublesEvent(owner, name) {
  await owner.goto(`${baseUrl}/#/events/new`, { waitUntil: 'domcontentloaded' });
  await labelInput(owner, 'Event name').fill(name);
  await labelInput(owner, 'Match type').selectOption('doubles');
  await owner.getByRole('button', { name: /Time & venue/i }).click();
  await labelInput(owner, 'Entry limit').fill('2');
  await labelInput(owner, 'Match date').fill(futureDate(10));
  await labelInput(owner, 'Start time').fill('20:00');
  await labelInput(owner, 'City *').fill('QA City');
  await labelInput(owner, 'Venue').fill('QA Court');
  const saveResponsePromise = owner.waitForResponse(r => r.url().includes('/rest/v1/rpc/save_event') && r.request().method() === 'POST', { timeout: 30000 });
  await owner.getByRole('button', { name: 'Create event', exact: true }).click();
  const saveResponse = await saveResponsePromise;
  record(`${evidenceId} standard event save_event accepts current form contract`, saveResponse.ok(), `status=${saveResponse.status()}`);
  await owner.waitForURL(/#\/events\/[0-9a-f-]+\/manage/, { timeout: 30000 });
  const id = owner.url().match(/#\/events\/([0-9a-f-]+)\/manage/)?.[1];
  record(`${evidenceId} doubles event created through real UI`, !!id, owner.url());
  return id;
}

async function registerRealDoublesTeam(owner, partner, id, eventName, partnerName) {
  await owner.getByRole('button', { name: 'Register myself', exact: true }).click();
  await owner.getByText('Doubles registration', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  const partnerRow = owner.locator('.row').filter({ hasText: partnerName }).filter({ has: owner.getByRole('button', { name: 'Invite to team', exact: true }) }).first();
  await partnerRow.getByRole('button', { name: 'Invite to team', exact: true }).click();
  await owner.getByText('Awaiting confirmation', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await partner.goto(`${baseUrl}/#/event-invites`, { waitUntil: 'domcontentloaded' });
  const inviteCard = partner.locator('article.event-invite-card').filter({ hasText: eventName }).first();
  await inviteCard.getByRole('button', { name: 'Accept team', exact: true }).click();
  await inviteCard.getByText(/Team request accepted/i).waitFor({ state: 'visible', timeout: 30000 });
  record(`${evidenceId} second real partner accepts doubles team invite`, true, eventName);
  await owner.goto(`${baseUrl}/#/events/${id}/manage`, { waitUntil: 'domcontentloaded' });
  await owner.reload({ waitUntil: 'domcontentloaded' });
  await owner.getByRole('button', { name: 'Register myself', exact: true }).click();
  await owner.getByText('Doubles registration', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  const acceptedRow = owner.locator('.row').filter({ hasText: partnerName }).filter({ has: owner.getByRole('button', { name: 'Select', exact: true }) }).first();
  const selectPartner = acceptedRow.getByRole('button', { name: 'Select', exact: true });
  await selectPartner.waitFor({ state: 'visible', timeout: 20000 });
  await owner.waitForFunction(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Select'); return !!b && !b.disabled; }, null, { timeout: 20000 });
  await selectPartner.click();
  await owner.getByText(/is selected as your partner/i).waitFor({ state: 'visible', timeout: 20000 });
  const confirmRegistration = owner.getByRole('button', { name: 'Confirm registration', exact: true });
  await confirmRegistration.waitFor({ state: 'visible', timeout: 20000 });
  await owner.waitForFunction(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Confirm registration'); return !!b && !b.disabled; }, null, { timeout: 20000 });
  await confirmRegistration.click();
  await owner.getByRole('status').filter({ hasText: 'Registered' }).waitFor({ state: 'visible', timeout: 30000 });
  await owner.getByRole('button', { name: 'View roster', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  record(`${evidenceId} doubles entry signup_user is first real user`, true, id);
}

async function verifySecondPartnerCta(owner, partner, id) {
  await partner.goto(`${baseUrl}/#/events/${id}`, { waitUntil: 'domcontentloaded' });
  await partner.getByRole('status').filter({ hasText: 'Registered' }).waitFor({ state: 'visible', timeout: 30000 });
  const openCta = partner.getByRole('button', { name: 'View roster', exact: true });
  await openCta.waitFor({ state: 'visible', timeout: 30000 });
  record(`${evidenceId} non-signup second real partner receives registered status and roster CTA`, true, partner.url());
  await openCta.click();
  const withdraw = partner.getByRole('button', { name: 'Withdraw', exact: true });
  await withdraw.waitFor({ state: 'visible', timeout: 20000 });
  record(`${evidenceId} second real partner can reach entry-level Withdraw control`, true, 'Withdraw visible before deadline');
  await shot(partner, 'aud015-second-partner-withdraw-open');

  await owner.goto(`${baseUrl}/#/events/${id}/edit`, { waitUntil: 'domcontentloaded' });
  await waitForLoadedInput(owner, 'Event name');
  await owner.getByRole('button', { name: /Time & venue/i }).click();
  const deadline = labelInput(owner, 'Registration deadline');
  await deadline.fill('2000-01-01T00:00');
  await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
  await owner.waitForURL(new RegExp(`#\\/events\\/${id}\\/manage`), { timeout: 30000 });

  await partner.goto(`${baseUrl}/#/events/${id}`, { waitUntil: 'domcontentloaded' });
  await partner.getByRole('status').filter({ hasText: 'Registered' }).waitFor({ state: 'visible', timeout: 30000 });
  const closedCta = partner.getByRole('button', { name: 'View roster', exact: true });
  await closedCta.waitFor({ state: 'visible', timeout: 30000 });
  record(`${evidenceId} deadline-closed registered status remains view-only for second real partner`, true, `registered status + roster CTA visible; url=${partner.url()}`);
  await closedCta.click();
  const closedWithdraw = partner.getByRole('button', { name: 'Withdraw', exact: true });
  await closedWithdraw.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  const withdrawCount = await closedWithdraw.count();
  record(`${evidenceId} roster-level Withdraw is absent after deadline closes`, withdrawCount === 0, `withdrawCount=${withdrawCount}; registration-closed state confirmed`);
  await shot(partner, 'aud015-second-partner-deadline-closed');
}

const browser = await chromium.launch();
let ownerContext, partnerContext;
try {
  await exactHead();
  ownerContext = await context(browser, 'aud015-owner-trace');
  partnerContext = await context(browser, 'aud015-partner-trace');
  const owner = await ownerContext.newPage();
  const partner = await partnerContext.newPage();
  const suffix = `${expectedSha.slice(0, 6)}-${Date.now().toString().slice(-5)}`;
  const ownerName = `QA15-Owner-${suffix}`;
  const partnerName = `QA15-Partner-${suffix}`;
  await identity(owner, ownerName);
  await identity(partner, partnerName);
  await connect(owner, partner, ownerName, partnerName);
  const eventName = `QA AUD015 Doubles ${suffix}`;
  const id = await createDoublesEvent(owner, eventName);
  result.evidence.eventId = id;
  await registerRealDoublesTeam(owner, partner, id, eventName, partnerName);
  await verifySecondPartnerCta(owner, partner, id);
  result.ok = true;
} catch (e) {
  result.ok = false;
  result.error = e instanceof Error ? e.stack || e.message : String(e);
  throw e;
} finally {
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'aud015-result.json'), JSON.stringify(result, null, 2));
  if (ownerContext) await closeContext(ownerContext).catch(() => {});
  if (partnerContext) await closeContext(partnerContext).catch(() => {});
  await browser.close();
}