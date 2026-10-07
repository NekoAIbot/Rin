-- Add super_admin role and permanent owner protection
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
