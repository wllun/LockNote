// Runs ONLY against the disposable container created for this verification.
import { readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const container = 'locknote-premium-plan2-check';
if (process.argv[2] !== container) throw new Error(`Pass ${container}; never use this fixture against a real database.`);
const run = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'], { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
run(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text unique, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant execute on function auth.uid(), storage.foldername(text) to authenticated;
grant select,insert,delete on storage.objects to authenticated;
create publication supabase_realtime;
`);
for (const file of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
  run(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  console.log(`Applied ${file}`);
}
const owner = '00000000-0000-0000-0000-000000000001';
const editor = '00000000-0000-0000-0000-000000000002';
const shared = '10000000-0000-0000-0000-000000000001';
run(`insert into auth.users values ('${owner}', 'owner@test.invalid'), ('${editor}', 'editor@test.invalid');`);
const authenticated = (sql, id = owner) => `set role authenticated; set request.jwt.claim.sub = '${id}'; ${sql}`;
const rejected = (sql, message) => assert.throws(() => run(sql), message);
assert.match(run(authenticated('select get_subscription_access();')), /26214400/);
rejected(authenticated(`insert into user_subscriptions(user_id,plan) values ('${owner}','pro');`), /permission denied/);
rejected(authenticated(`select apply_verified_subscription('${owner}','pro',now()+interval '1 year',now());`), /permission denied/);
rejected(authenticated(`select create_shared_note('local','note','Title','body');`), /Plus or Pro/);
run(`select apply_verified_subscription('${owner}', 'pro', now() + interval '1 month', now());`);
assert.match(run(authenticated('select get_subscription_access();')), /786432000/);
run(authenticated(`select sync_private_data('[{"id":"root","name":"Root","updated_at":"2026-09-17T00:00:00Z"},{"id":"child","parent_id":"root","name":"Child","updated_at":"2026-09-17T00:00:00Z"}]', '[]');`));
run(`set request.jwt.claim.sub = '${owner}'; insert into shared_notes(id,owner_id,local_note_id,note_type,title,content,updated_by) values ('${shared}','${owner}','shared-local','note','Shared','body','${owner}'); insert into note_members(note_id,user_id,role,invited_by) values ('${shared}','${editor}','editor','${owner}');`);
assert.match(run(authenticated(`select * from acquire_shared_note_edit_lease('${shared}',90);`, editor)), /^t\|/);
assert.equal(run(authenticated(`select can_add_note_images('${shared}');`, editor)).trim(), 't');
assert.match(run(authenticated('select title from list_shared_notes();', editor)), /Shared/);
assert.equal(run(authenticated(`select can_access_shared_note('${shared}');`, editor)).trim(), 't');
run(authenticated(`select reserve_attachment_upload('image1',null,'${shared}');`, editor));
const path = `${editor}/${shared}/image1.jpg`;
run(authenticated(`insert into storage.objects(bucket_id,name,metadata) values ('note-attachments','${path}','{"size":1024}'); select register_note_attachment('image1',null,'${shared}','${path}','image/jpeg',1024,32,32,0,0,1);`, editor));
assert.ok(Number(run(`select cloud_usage_bytes('${owner}');`).trim()) > 1024);
assert.equal(Number(run(`select cloud_usage_bytes('${editor}');`).trim()), 0);
run(authenticated(`select reserve_attachment_upload('revoked',null,'${shared}');`, editor));
run(`delete from note_members where note_id = '${shared}' and user_id = '${editor}';`);
rejected(authenticated(`insert into storage.objects(bucket_id,name,metadata) values ('note-attachments','${editor}/${shared}/revoked.jpg','{"size":10}');`, editor), /row-level security/);
run(`insert into note_members(note_id,user_id,role,invited_by) values ('${shared}','${editor}','editor','${owner}'); delete from attachment_upload_reservations where storage_path like '%/revoked.jpg';`);
rejected(authenticated(`insert into storage.objects(bucket_id,name,metadata) values ('note-attachments','${editor}/${shared}/bypass.jpg','{"size":10}');`, editor), /row-level security/);
run(`select apply_verified_subscription('${owner}', 'free', null, now());`);
assert.equal(run(authenticated('select * from list_shared_notes();', editor)).trim(), '');
assert.equal(run(authenticated(`select can_access_shared_note('${shared}');`, editor)).trim(), 'f');
rejected(authenticated(`select * from get_shared_note('${shared}');`, editor), /no longer have access/);
assert.equal(run(authenticated(`select * from list_note_attachments(null,'${shared}');`, editor)).trim(), '');
assert.equal(run(authenticated(`select count(*) from shared_notes where id = '${shared}';`, editor)).trim(), '0');
assert.equal(run(authenticated(`select count(*) from note_members where note_id = '${shared}';`, editor)).trim(), '0');
assert.equal(run(authenticated(`select count(*) from note_attachments where shared_note_id = '${shared}';`, editor)).trim(), '0');
assert.equal(run(authenticated(`select count(*) from storage.objects where name = '${path}';`, editor)).trim(), '0');
assert.equal(run(authenticated(`select can_write_note_attachments('${shared}');`, editor)).trim(), 'f');
assert.match(run(authenticated(`select get_note_subscription_access('${shared}');`, editor)), /"can_view": false/);
// The pre-expiry lease is still present; even an unchanged payload must fail.
rejected(authenticated(`select * from save_shared_note('${shared}',0,'Shared','body');`, editor), /Sharing is unavailable/);
rejected(authenticated(`select * from save_shared_note_subscription_unchecked('${shared}',0,'Shared','body');`, editor), /permission denied/);
assert.match(run(authenticated(`select * from get_shared_note('${shared}');`)), /Shared/);
assert.match(run(authenticated(`select * from list_note_attachments(null,'${shared}');`)), /image1/);
assert.equal(run(`select count(*) from note_members where note_id = '${shared}' and user_id = '${editor}';`).trim(), '1');
rejected(authenticated(`select * from acquire_shared_note_edit_lease('${shared}',90);`, editor), /paused/);
rejected(authenticated(`select reserve_attachment_upload('image2',null,'${shared}');`, editor), /view only/);
rejected(authenticated(`select reserve_attachment_upload('owner-image2',null,'${shared}');`), /Pro/);
run(authenticated(`select sync_private_data('[{"id":"child","parent_id":"root","name":"Child","updated_at":"2026-09-18T00:00:00Z"}]', '[]');`));
rejected(authenticated(`select sync_private_data('[{"id":"new-child","parent_id":"root","name":"New","updated_at":"2026-09-18T00:00:00Z"}]','[]');`), /Pro/);
// Upgrade to create a large snapshot, then downgrade without deleting it.
run(`select apply_verified_subscription('${owner}', 'plus', now()+interval '1 month', now());`);
assert.match(run(authenticated('select get_subscription_access();')), /78643200/);
assert.match(run(authenticated('select title from list_shared_notes();', editor)), /Shared/);
assert.match(run(authenticated(`select * from list_note_attachments(null,'${shared}');`, editor)), /image1/);
assert.equal(run(authenticated(`select can_add_note_images('${shared}');`, editor)).trim(), 'f');
// Natural deadline expiry (without a Free webhook) also removes recipient access.
run(`update user_subscriptions set expires_at = now()-interval '1 second' where user_id = '${owner}';`);
assert.equal(run(authenticated('select * from list_shared_notes();', editor)).trim(), '');
rejected(authenticated(`select * from get_shared_note('${shared}');`, editor), /no longer have access/);
run(`select apply_verified_subscription('${owner}', 'plus', now()+interval '1 month', now());`);
assert.match(run(authenticated(`select * from get_shared_note('${shared}');`, editor)), /Shared/);
run(authenticated(`insert into private_notes(owner_id,local_id,title,content,client_created_at,client_updated_at) values ('${owner}','large','Large',repeat('x',27000000),now(),now());`));
run(`select apply_verified_subscription('${owner}', 'free', null, now());`);
rejected(authenticated(`insert into private_notes(owner_id,local_id,title,content,client_created_at,client_updated_at) values ('${owner}','extra','Extra','more',now(),now());`), /CLOUD_QUOTA_EXCEEDED/);
assert.match(run(authenticated(`select length(recover_private_data()->'notes'->0->>'content');`)), /27000000/);
// Shrinks are permitted while over quota; stale canonical state is ignored.
run(authenticated(`update private_notes set content = 'small' where local_id = 'large';`));
run(`select apply_verified_subscription('${owner}', 'pro', now()+interval '1 month', now()-interval '1 day');`);
assert.match(run(authenticated('select get_subscription_access();')), /"plan": "free"/);
// Two concurrent uploads that individually fit must not both exceed the quota.
run(authenticated(`update private_notes set content = repeat('x',25165824) where local_id = 'large';`));
const concurrentWrite = (id) => new Promise((resolve) => {
  const process = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t']);
  let stderr = '';
  process.stderr.on('data', (data) => { stderr += data; });
  process.stdout.resume();
  process.on('error', (error) => resolve({ code: -1, stderr: error.message }));
  process.on('close', (code) => resolve({ code, stderr }));
  process.stdin.end(authenticated(`begin; insert into private_notes(owner_id,local_id,title,content,client_created_at,client_updated_at) values ('${owner}','${id}','Race',repeat('x',600000),now(),now()); select pg_sleep(0.2); commit;`));
});
const race = await Promise.all([concurrentWrite('race1'), concurrentWrite('race2')]);
assert.equal(race.filter((item) => item.code === 0).length, 1);
assert.match(race.find((item) => item.code !== 0).stderr, /CLOUD_QUOTA_EXCEEDED/);
console.log('PASS premium database: migrations, RLS, owner-funded Free editor, upload reservation/revocation, sharing suspension/renewal/read-denial, downgrade preservation, quota growth/shrink/concurrency, recovery, stale webhook');
