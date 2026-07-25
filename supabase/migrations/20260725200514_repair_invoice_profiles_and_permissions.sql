drop policy if exists "Users can create their own profile"
  on public.profiles;

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

revoke all privileges on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;

grant insert (
  id,
  email
) on public.profiles to authenticated;

grant update (
  company_name,
  company_address,
  company_number,
  account_number,
  sort_code,
  logo_url,
  updated_at
) on public.profiles to authenticated;
