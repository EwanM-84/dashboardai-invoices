create schema if not exists app_private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  company_name text not null default '',
  company_address text not null default '',
  company_number text not null default '',
  account_number text not null default '',
  sort_code text not null default '',
  logo_url text not null default '',
  plan text not null default 'none'
    check (plan in ('none', 'starter', 'pro', 'owner')),
  subscription_status text not null default 'inactive'
    check (subscription_status in (
      'inactive', 'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'unpaid', 'canceled', 'paused', 'owner'
    )),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  owner_bypass boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  client_name text not null default '',
  status text not null default 'Draft'
    check (status in ('Draft', 'Sent', 'Paid')),
  total numeric(12, 2) not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_user_created_idx
  on public.invoices (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.invoices enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own company details"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read their own invoices"
  on public.invoices for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own invoices"
  on public.invoices for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own invoices"
  on public.invoices for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own invoices"
  on public.invoices for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.profiles to authenticated;
grant update (
  company_name,
  company_address,
  company_number,
  account_number,
  sort_code,
  logo_url,
  updated_at
) on public.profiles to authenticated;

grant select, insert, update, delete on public.invoices to authenticated;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.enforce_monthly_invoice_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan text;
  current_status text;
  used_count integer;
begin
  select plan, subscription_status
  into current_plan, current_status
  from public.profiles
  where id = new.user_id
  for update;

  if current_plan in ('pro', 'owner')
    and current_status in ('active', 'trialing', 'owner') then
    return new;
  end if;

  if current_plan <> 'starter'
    or current_status not in ('active', 'trialing') then
    raise exception 'An active plan is required to create invoices';
  end if;

  select count(*)
  into used_count
  from public.invoices
  where user_id = new.user_id
    and created_at >= date_trunc('month', now())
    and created_at < date_trunc('month', now()) + interval '1 month';

  if used_count >= 20 then
    raise exception 'Starter plan monthly limit of 20 invoices reached';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_monthly_invoice_limit() from public;

create trigger enforce_invoice_limit_before_insert
  before insert on public.invoices
  for each row execute function app_private.enforce_monthly_invoice_limit();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "Authenticated users can upload their company logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can replace their own company logo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'company-logos'
    and owner_id = (select auth.uid())::text
  );

create policy "Users can delete their own company logo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and owner_id = (select auth.uid())::text
  );
