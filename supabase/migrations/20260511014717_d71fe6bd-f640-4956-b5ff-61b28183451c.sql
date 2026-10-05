
-- Enums
do $$ begin
  create type public.announcement_kind as enum ('promo_popup','version_update','ad_banner','system_notice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.announcement_placement as enum ('popup_center','top_banner','bottom_strip','inline_card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.announcement_variant as enum ('info','success','warning','promo');
exception when duplicate_object then null; end $$;

-- Tables
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind public.announcement_kind not null,
  placement public.announcement_placement not null default 'popup_center',
  variant public.announcement_variant not null default 'info',
  title text not null,
  body text,
  cta_label text,
  cta_url text,
  image_url text,
  icon text,
  audience text not null default 'all',
  is_active boolean not null default true,
  is_dismissible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  version text,
  priority int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_active on public.announcements (is_active, placement, priority desc);

create table if not exists public.announcement_dismissals (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- updated_at trigger
create or replace function public.set_announcement_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_announcement_updated_at();

-- RLS
alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;

drop policy if exists "Anyone authenticated can read active announcements" on public.announcements;
create policy "Anyone authenticated can read active announcements"
  on public.announcements for select
  to authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "Super admin manage announcements (select)" on public.announcements;
create policy "Super admin manage announcements (select)"
  on public.announcements for select
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin manage announcements (insert)" on public.announcements;
create policy "Super admin manage announcements (insert)"
  on public.announcements for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin manage announcements (update)" on public.announcements;
create policy "Super admin manage announcements (update)"
  on public.announcements for update
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin manage announcements (delete)" on public.announcements;
create policy "Super admin manage announcements (delete)"
  on public.announcements for delete
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Users read own dismissals" on public.announcement_dismissals;
create policy "Users read own dismissals"
  on public.announcement_dismissals for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Users insert own dismissals" on public.announcement_dismissals;
create policy "Users insert own dismissals"
  on public.announcement_dismissals for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users delete own dismissals" on public.announcement_dismissals;
create policy "Users delete own dismissals"
  on public.announcement_dismissals for delete
  to authenticated using (auth.uid() = user_id);

-- Storage bucket for banner images
insert into storage.buckets (id, name, public)
  values ('announcement-assets','announcement-assets', true)
  on conflict (id) do nothing;

drop policy if exists "Public read announcement assets" on storage.objects;
create policy "Public read announcement assets"
  on storage.objects for select
  using (bucket_id = 'announcement-assets');

drop policy if exists "Super admin upload announcement assets" on storage.objects;
create policy "Super admin upload announcement assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'announcement-assets' and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin update announcement assets" on storage.objects;
create policy "Super admin update announcement assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'announcement-assets' and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admin delete announcement assets" on storage.objects;
create policy "Super admin delete announcement assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'announcement-assets' and public.has_role(auth.uid(), 'super_admin'));

-- Seed (chỉ insert nếu chưa có promo_popup nào)
insert into public.announcements
  (kind, placement, variant, title, body, cta_label, cta_url, icon, audience, is_active, priority)
select 'promo_popup','popup_center','promo',
  'Chương trình hỗ trợ chuyển đổi số',
  E'Miễn phí sử dụng 5 tháng toàn bộ tính năng phần mềm.\nMiễn phí setup & cài đặt.\nLiên hệ hỗ trợ: 0828686866 — roomqc@gmail.com',
  'Đã hiểu, bắt đầu sử dụng', null, 'Gift', 'trial_only', true, 100
where not exists (
  select 1 from public.announcements where kind = 'promo_popup'
);
