create table if not exists public.app_update_config (
  platform text primary key check (platform in ('android', 'ios')),
  latest_version_code bigint not null check (latest_version_code > 0),
  minimum_version_code bigint not null check (minimum_version_code > 0),
  force_update_enabled boolean not null default false,
  update_url text not null check (update_url ~ '^(https|market)://'),
  message text not null default 'A newer version of LockNote is required to continue.',
  updated_at timestamptz not null default now(),
  check (latest_version_code >= minimum_version_code)
);

alter table public.app_update_config enable row level security;

drop policy if exists "Public can read app update config" on public.app_update_config;
create policy "Public can read app update config"
  on public.app_update_config
  for select
  to anon, authenticated
  using (true);

revoke all on table public.app_update_config from anon, authenticated;
grant select on table public.app_update_config to anon, authenticated;

insert into public.app_update_config (
  platform,
  latest_version_code,
  minimum_version_code,
  force_update_enabled,
  update_url,
  message
) values (
  'android',
  2,
  1,
  false,
  'https://play.google.com/store/apps/details?id=com.locknote.app',
  'A newer version of LockNote is required to continue.'
)
on conflict (platform) do nothing;
