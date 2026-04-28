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
  v_first_name text;
  v_last_name text;
  v_has_email boolean;
  v_has_display_name boolean;
  v_has_psn boolean;
  v_has_first_name boolean;
  v_has_last_name boolean;
  v_sql text;
  v_insert_cols text;
  v_insert_vals text;
  v_update_set text;
begin
  v_email := new.email;
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '');
  v_psn := coalesce(new.raw_user_meta_data->>'psn', '');
  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', '');
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');

  if to_regclass('public.profiles') is not null then
    begin
      select exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'psn'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_name'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_name'
             )
        into v_has_email, v_has_display_name, v_has_psn, v_has_first_name, v_has_last_name;

      v_insert_cols := 'user_id';
      v_insert_vals := format('%L::uuid', new.id);
      v_update_set := 'user_id = excluded.user_id';

      if v_has_email then
        v_insert_cols := v_insert_cols || ', email';
        v_insert_vals := v_insert_vals || format(', %L', v_email);
        v_update_set := v_update_set || ', email = coalesce(nullif(excluded.email, ''''), profiles.email)';
      end if;

      if v_has_display_name then
        v_insert_cols := v_insert_cols || ', display_name';
        v_insert_vals := v_insert_vals || format(', %L', v_display_name);
        v_update_set := v_update_set || ', display_name = coalesce(nullif(excluded.display_name, ''''), profiles.display_name)';
      end if;

      if v_has_psn then
        v_insert_cols := v_insert_cols || ', psn';
        v_insert_vals := v_insert_vals || format(', %L', v_psn);
        v_update_set := v_update_set || ', psn = coalesce(nullif(excluded.psn, ''''), profiles.psn)';
      end if;

      if v_has_first_name then
        v_insert_cols := v_insert_cols || ', first_name';
        v_insert_vals := v_insert_vals || format(', %L', v_first_name);
        v_update_set := v_update_set || ', first_name = coalesce(nullif(excluded.first_name, ''''), profiles.first_name)';
      end if;

      if v_has_last_name then
        v_insert_cols := v_insert_cols || ', last_name';
        v_insert_vals := v_insert_vals || format(', %L', v_last_name);
        v_update_set := v_update_set || ', last_name = coalesce(nullif(excluded.last_name, ''''), profiles.last_name)';
      end if;

      v_sql := format(
        'insert into public.profiles (%s) values (%s) on conflict (user_id) do update set %s',
        v_insert_cols,
        v_insert_vals,
        v_update_set
      );

      execute v_sql;
    exception when others then
      raise notice 'eg_handle_new_user(): profiles upsert failed: %', sqlerrm;
    end;
  end if;

  if to_regclass('public.eg_profiles') is not null then
    begin
      select exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'eg_profiles' and column_name = 'email'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'eg_profiles' and column_name = 'display_name'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'eg_profiles' and column_name = 'psn'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'eg_profiles' and column_name = 'first_name'
             ),
             exists (
               select 1
               from information_schema.columns
               where table_schema = 'public' and table_name = 'eg_profiles' and column_name = 'last_name'
             )
        into v_has_email, v_has_display_name, v_has_psn, v_has_first_name, v_has_last_name;

      v_insert_cols := 'user_id';
      v_insert_vals := format('%L::uuid', new.id);
      v_update_set := 'user_id = excluded.user_id';

      if v_has_email then
        v_insert_cols := v_insert_cols || ', email';
        v_insert_vals := v_insert_vals || format(', %L', v_email);
        v_update_set := v_update_set || ', email = coalesce(nullif(excluded.email, ''''), eg_profiles.email)';
      end if;

      if v_has_display_name then
        v_insert_cols := v_insert_cols || ', display_name';
        v_insert_vals := v_insert_vals || format(', %L', v_display_name);
        v_update_set := v_update_set || ', display_name = coalesce(nullif(excluded.display_name, ''''), eg_profiles.display_name)';
      end if;

      if v_has_psn then
        v_insert_cols := v_insert_cols || ', psn';
        v_insert_vals := v_insert_vals || format(', %L', v_psn);
        v_update_set := v_update_set || ', psn = coalesce(nullif(excluded.psn, ''''), eg_profiles.psn)';
      end if;

      if v_has_first_name then
        v_insert_cols := v_insert_cols || ', first_name';
        v_insert_vals := v_insert_vals || format(', %L', v_first_name);
        v_update_set := v_update_set || ', first_name = coalesce(nullif(excluded.first_name, ''''), eg_profiles.first_name)';
      end if;

      if v_has_last_name then
        v_insert_cols := v_insert_cols || ', last_name';
        v_insert_vals := v_insert_vals || format(', %L', v_last_name);
        v_update_set := v_update_set || ', last_name = coalesce(nullif(excluded.last_name, ''''), eg_profiles.last_name)';
      end if;

      v_sql := format(
        'insert into public.eg_profiles (%s) values (%s) on conflict (user_id) do update set %s',
        v_insert_cols,
        v_insert_vals,
        v_update_set
      );

      execute v_sql;
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
