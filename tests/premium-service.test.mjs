import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as access from '../src/utils/premium-access.mjs';

const createService = (rpc) => {
  const source = readFileSync(new URL('../src/services/premiumAccessService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export const premiumAccessService', 'const premiumAccessService');
  return vm.runInNewContext(`${source}\npremiumAccessService;`, { ...access, isSupabaseConfigured: true, supabase: { rpc } });
};
const paidInfo = { entitlements: { active: { pro: { isActive: true, expirationDate: '2099-01-01' } } } };
test('paid native actions work offline; changing accounts clears the entitlement', async () => {
  const service = createService(async () => { throw new Error('offline'); });
  service.setIdentity('owner'); service.setCustomerInfo(paidInfo);
  await service.require('attachments');
  service.setIdentity('other-account');
  assert.equal(service.getPlan(), 'free');
  await assert.rejects(service.require('nesting'), { code: 'PREMIUM_REQUIRED' });
});
test('server-verified paid plans work without a store SDK and expire safely', async () => {
  let subscription = { plan: 'plus', expires_at: '2099-01-01', used_bytes: 1024 };
  const service = createService(async () => ({ data: subscription }));
  service.setIdentity('owner');
  await service.require('sharing');
  await assert.rejects(service.require('backgrounds'), { code: 'PREMIUM_REQUIRED' });
  await service.refresh(true);
  assert.equal(service.getServerAccess().used_bytes, 1024);
  subscription = { plan: 'free', expires_at: null, used_bytes: null };
  await service.refresh();
  assert.equal(service.getPlan(), 'free');
  assert.equal(service.getServerAccess().used_bytes, 1024);
});
test('late server responses cannot grant the next account paid access', async () => {
  let resolve;
  const service = createService(() => new Promise((done) => { resolve = done; }));
  service.setIdentity('owner');
  const refreshing = service.refresh();
  service.setIdentity('next');
  resolve({ data: { plan: 'pro', expires_at: '2099-01-01' } });
  await refreshing;
  assert.equal(service.getPlan(), 'free');
});
