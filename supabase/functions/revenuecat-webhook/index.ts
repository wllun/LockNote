import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifiedSubscription, webhookAccountIds } from './entitlements.mjs';

// Configure this same full Authorization value in RevenueCat's webhook setup.
// No public SDK key or client-supplied plan is accepted as subscription proof.
const equalSecret = (actual: string, expected: string) => {
  const encoder = new TextEncoder();
  const a = encoder.encode(actual); const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
};
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION');
  const apiKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret || !apiKey) return new Response('Webhook is not configured', { status: 503 });
  if (!equalSecret(request.headers.get('Authorization') ?? '', secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { event } = await request.json();
    if (!event?.id || !event?.type) return new Response('Invalid event', { status: 400 });
    if (event.environment === 'SANDBOX' && Deno.env.get('REVENUECAT_ALLOW_SANDBOX') !== 'true') {
      return new Response('Sandbox ignored', { status: 200 });
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    for (const userId of webhookAccountIds(event)) {
      const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) continue;
      const checkedAt = new Date().toISOString();
      // Fetch current state on ALL events: cancellation keeps paid access until
      // expiry; renewals, grace, refunds, duplicate/late events and transfers all
      // converge to the same canonical subscription instead of event ordering.
      const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`RevenueCat returned ${response.status}`);
      const { subscriber } = await response.json();
      const access = verifiedSubscription(subscriber, Date.now(), Deno.env.get('REVENUECAT_ALLOW_SANDBOX') === 'true');
      const { error } = await admin.rpc('apply_verified_subscription', {
        p_user_id: userId, p_plan: access.plan, p_expires_at: access.expires_at, p_checked_at: checkedAt,
      });
      if (error) throw error;
    }
    return new Response('ok', { status: 200 });
  } catch {
    // Non-200 asks RevenueCat to retry; never log secrets or customer payloads.
    return new Response('Subscription refresh failed', { status: 503 });
  }
});
