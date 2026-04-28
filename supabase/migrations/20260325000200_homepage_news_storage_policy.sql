-- Storage policies for news images in the Assets bucket.
-- Admins (via eg_is_admin()) can insert, select, update, delete under news/.
-- Does NOT touch existing submissions/ policies.

begin;

-- INSERT: admins can upload to news/
drop policy if exists "assets_news_insert_admin" on storage.objects;
create policy "assets_news_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'Assets'
  and (storage.foldername(name))[1] = 'news'
  and public.eg_is_admin()
);

-- SELECT: admins can read news/ objects (public bucket already serves via URL,
-- but this covers .list() / .download() calls from the client)
drop policy if exists "assets_news_select_admin" on storage.objects;
create policy "assets_news_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'Assets'
  and (storage.foldername(name))[1] = 'news'
  and public.eg_is_admin()
);

-- UPDATE: admins can overwrite news/ objects
drop policy if exists "assets_news_update_admin" on storage.objects;
create policy "assets_news_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'Assets'
  and (storage.foldername(name))[1] = 'news'
  and public.eg_is_admin()
)
with check (
  bucket_id = 'Assets'
  and (storage.foldername(name))[1] = 'news'
  and public.eg_is_admin()
);

-- DELETE: admins can remove news/ objects
drop policy if exists "assets_news_delete_admin" on storage.objects;
create policy "assets_news_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'Assets'
  and (storage.foldername(name))[1] = 'news'
  and public.eg_is_admin()
);

commit;
