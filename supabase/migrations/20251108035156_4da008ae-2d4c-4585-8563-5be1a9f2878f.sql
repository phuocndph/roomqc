-- ============================================
-- CRITICAL SECURITY FIX: Separate User Roles Table
-- ============================================

-- Create app_role enum
create type public.app_role as enum ('super_admin', 'owner', 'hotel_manager', 'department_manager', 'staff');

-- Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  unique (user_id, role)
);

-- Enable RLS
alter table public.user_roles enable row level security;

-- Create security definer function to check roles (prevents recursive RLS)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Create helper function to get user's primary role
create or replace function public.get_user_primary_role(_user_id uuid)
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = _user_id
  order by 
    case role
      when 'super_admin' then 1
      when 'owner' then 2
      when 'hotel_manager' then 3
      when 'department_manager' then 4
      when 'staff' then 5
    end
  limit 1
$$;

-- Migrate existing roles from users table to user_roles table
insert into public.user_roles (user_id, role)
select id, role::app_role
from public.users
where role is not null
on conflict (user_id, role) do nothing;

-- RLS Policies for user_roles
create policy "Users can view their own roles"
  on public.user_roles for select
  using (user_id = auth.uid());

create policy "Super admins can view all roles"
  on public.user_roles for select
  using (public.has_role(auth.uid(), 'super_admin'));

create policy "Owners can manage roles in their tenant"
  on public.user_roles for all
  using (
    public.has_role(auth.uid(), 'super_admin')
    or (
      public.has_role(auth.uid(), 'owner')
      and exists (
        select 1 from users u1
        join users u2 on u1.tenant_id = u2.tenant_id
        where u1.id = auth.uid()
        and u2.id = user_roles.user_id
      )
    )
  );

-- Update helper functions to use user_roles table
create or replace function get_current_user_role()
returns text as $$
  select role::text from user_roles where user_id = auth.uid() order by 
    case role
      when 'super_admin' then 1
      when 'owner' then 2
      when 'hotel_manager' then 3
      when 'department_manager' then 4
      when 'staff' then 5
    end
  limit 1;
$$ language sql stable security definer;

create or replace function is_super_admin()
returns boolean as $$
  select public.has_role(auth.uid(), 'super_admin');
$$ language sql stable security definer;

-- Create index for performance
create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_role on public.user_roles(role);