-- ==============================================================================
-- MIGRACIÓN SUPABASE: TABLA DE ESTADO DE PERFORADORAS (drill_statuses)
-- Ejecuta este script en el SQL Editor de tu panel de Supabase:
-- https://supabase.com/dashboard/project/nejeazmulvcwfhunzjej/sql
-- ==============================================================================

-- 1. Crear tabla drill_statuses si no existe
create table if not exists public.drill_statuses (
  drill_number text primary key,
  model text not null,
  status text not null default 'Operativa',
  phase text default '',
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Habilitar Row Level Security (RLS)
alter table public.drill_statuses enable row level security;

-- 3. Crear políticas CRUD para usuarios autenticados
drop policy if exists "Lectura autenticada en drill_statuses" on public.drill_statuses;
create policy "Lectura autenticada en drill_statuses"
  on public.drill_statuses for select
  using (auth.role() = 'authenticated');

drop policy if exists "Insercion autenticada en drill_statuses" on public.drill_statuses;
create policy "Insercion autenticada en drill_statuses"
  on public.drill_statuses for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Actualizacion autenticada en drill_statuses" on public.drill_statuses;
create policy "Actualizacion autenticada en drill_statuses"
  on public.drill_statuses for update
  using (auth.role() = 'authenticated');

drop policy if exists "Eliminacion autenticada en drill_statuses" on public.drill_statuses;
create policy "Eliminacion autenticada en drill_statuses"
  on public.drill_statuses for delete
  using (auth.role() = 'authenticated');

-- 4. Insertar los valores iniciales de las 10 perforadoras
insert into public.drill_statuses (drill_number, model, status, phase)
values
  ('5', 'PV275', 'Operativa', ''),
  ('6', 'PV275', 'Operativa', ''),
  ('7', 'PV275', 'Operativa', ''),
  ('8', 'ROC L8', 'Operativa', ''),
  ('9', 'MD6540', 'Operativa', ''),
  ('10', 'MD6540', 'Operativa', ''),
  ('11', 'ROC L8', 'Operativa', ''),
  ('12', 'PV275XC', 'Operativa', ''),
  ('13', 'PV275XC', 'Operativa', ''),
  ('14', 'ROC L8', 'Operativa', '')
on conflict (drill_number) do nothing;
