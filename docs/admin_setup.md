# Admin Setup

Use this after running `supabase/migrations/20260301_admin_console.sql`.

## 1) Find your user ID (`auth.uid()`)

1. Sign in to the app.
2. Open a browser console on the app and inspect your Supabase session user ID, or query from SQL editor:

```sql
select auth.uid();
```

## 2) Promote your account

Run this in Supabase SQL editor:

```sql
update public.eg_profiles
set role = 'super_admin'
where user_id = 'YOUR-UUID';
```

After this, reload the app and open `/admin`.

## 3) If access still fails

- Confirm your row exists in `public.eg_profiles`.
- Confirm `is_banned = false`.
- Confirm migration policies and admin RPC grants were applied successfully.
