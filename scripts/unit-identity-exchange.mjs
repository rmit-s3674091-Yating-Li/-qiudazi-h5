import fs from 'node:fs';
import assert from 'node:assert/strict';

const auth=fs.readFileSync(new URL('../src/hooks/Auth.tsx',import.meta.url),'utf8');
const login=fs.readFileSync(new URL('../src/pages/LoginPage.tsx',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/test-identity-exchange/index.ts',import.meta.url),'utf8');
const normalization=fs.readFileSync(new URL('../supabase/migrations/20260905132000_test_identity_exchange_nickname_normalization.sql',import.meta.url),'utf8');
const lookup=fs.readFileSync(new URL('../supabase/migrations/20260905132100_test_identity_exchange_lookup.sql',import.meta.url),'utf8');

assert.match(auth,/test-identity-exchange/,'Auth must call controlled test identity exchange');
assert.match(auth,/verifyOtp\(\{token_hash:payload\.token_hash,type:"email"\}\)/,'Client must exchange one-time hash through Supabase verifyOtp');
assert.match(auth,/clearQueryCache\(\)/,'Nickname login must clear query cache before loading the new identity');
assert.match(auth,/markLoginRequired\(localStorage\)/,'Failed exchange must remain on explicit login boundary');
assert.match(login,/loginByNickname\(value\)/,'Login page must expose existing nickname recovery');
assert.match(edge,/lookup_test_identity_by_nickname/,'Edge function must use the service-role-only lookup');
assert.match(edge,/generateLink\(\{type:"magiclink",email\}\)/,'Edge function must mint a one-time verification link');
assert.doesNotMatch(edge,/password\s*:/,'Exchange response/source must not expose a password');
assert.doesNotMatch(edge,/refresh_token|access_token/,'Exchange must not expose session tokens');
assert.match(normalization,/lower\(btrim\(/,'Database nickname authority must trim and case-fold');
assert.match(normalization,/create unique index if not exists profiles_test_nickname_normalized_uidx/,'Database must enforce normalized nickname uniqueness');
assert.match(lookup,/revoke all on function public\.lookup_test_identity_by_nickname\(text\) from public, anon, authenticated/,'Nickname-to-auth lookup must not be public');
assert.match(lookup,/grant execute on function public\.lookup_test_identity_by_nickname\(text\) to service_role/,'Only service role may execute nickname lookup');

console.log('unit-identity-exchange: ok');
