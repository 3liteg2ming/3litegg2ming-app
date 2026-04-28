begin;

create or replace function public.eg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_psn text;
  v_email text;
begin
  -- Always succeed: never block auth signup
  v_email := new.email;
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');

  -- Upsert into public.profiles ONLY if table exists.
  -- Use dynamic SQL so missing columns never crash.
  if to_regclass('public.profiles') is not null then
    begin
      execute format($f$
        insert into public.profiles (user_id, email, display_name, psn)
        values ($1, $2, $3, $4)
        on conflict (user_id) do update
          set email = excluded.email,
              display_name = coalesce(nullif(excluded.display_name,''), public.profiles.display_name),
              psn = coalesce(nullif(excluded.psn,''), public.profiles.psn)
      $f$)
      using new.id, v_email, v_display_name, v_psn;
    exception when others then
      -- swallow errors so signup never fails
      raise notice 'eg_handle_new_user(): profiles upsert failed: %', sqlerrm;
    end;
  end if;

  -- Upsert into public.eg_profiles ONLY if table exists.
  if to_regclass('public.eg_profiles') is not null then
    begin
      execute format($f$
        insert into public.eg_profiles (user_id, email, display_name, psn)
        values ($1, $2, $3, $4)
        on conflict (user_id) do update
          set email = excluded.email,
              display_name = coalesce(nullif(excluded.display_name,''), public.eg_profiles.display_name),
              psn = coalesce(nullif(excluded.psn,''), public.eg_profiles.psn)
      $f$)
      using new.id, v_email, v_display_name, v_psn;
    exception when others then
      raise notice 'eg_handle_new_user(): eg_profiles upsert failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.eg_handle_new_user();

commit;

notify pgrst, 'reload schema';
