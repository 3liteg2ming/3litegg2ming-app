-- Homepage news cards table
create table if not exists eg_homepage_news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text,
  image_url    text not null,
  caption      text,
  display_order int not null default 0,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS: public read for published rows
alter table eg_homepage_news enable row level security;

drop policy if exists "Public can read published news" on eg_homepage_news;
create policy "Public can read published news"
  on eg_homepage_news for select
  using (is_published = true);

drop policy if exists "Admins can manage news" on eg_homepage_news;
create policy "Admins can manage news"
  on eg_homepage_news for all
  using (true)
  with check (true);

-- Index for homepage query
create index if not exists idx_eg_homepage_news_published
  on eg_homepage_news (is_published, display_order, published_at desc);
