-- HLL account settings: public profile privacy controls.
-- Apply this migration in the Supabase SQL Editor before using privacy settings.

alter table public.profiles
    add column if not exists show_bio boolean not null default true,
    add column if not exists show_gd_username boolean not null default true,
    add column if not exists show_avatar boolean not null default true;

-- These settings are only writable through the normal profile owner RLS policy.
-- Ensure profiles has RLS enabled and an owner-only UPDATE policy on id = auth.uid().
alter table public.profiles enable row level security;
