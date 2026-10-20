-- ==============================================================================
-- SCHEMA SUPABASE: LOMAS BAYAS APP (OFFLINE-FIRST + SUPABASE AUTH)
-- Ejecuta este script completo en el SQL Editor de tu panel de Supabase.
-- ==============================================================================

-- 1. EXTENSIONES
create extension if not exists "uuid-ossp";

-- 2. TABLA DE PERFILES DE USUARIO (Vinculada a auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text default 'operador' check (role in ('operador', 'tecnico', 'analista', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para crear perfil automáticamente cuando un usuario se registra en Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'operador')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. TABLA: REPORTES DE TURNO (shift_reports)
create table if not exists public.shift_reports (
  id text primary key, -- UUID generado localmente para offline
  date date not null,
  shift text,
  drill_number text,
  operator text,
  bench text,
  phase text,
  mesh text,
  tricone_brand text,
  tricone_model text,
  tricone_serial text,
  tricone_diameter text,
  wells jsonb default '[]'::jsonb,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. TABLA: CAMBIO DE ACEROS (steel_changes)
create table if not exists public.steel_changes (
  id text primary key,
  date date not null,
  drill_number text,
  shift text,
  component text,
  serial_number text,
  comments text,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. TABLA: MEDICIONES DE ACEROS (steel_measurements)
create table if not exists public.steel_measurements (
  id text primary key,
  date date not null,
  shift text,
  drill_number text,
  adaptador_inferior_medio numeric,
  barra_patera_superior numeric,
  barra_patera_medio numeric,
  barra_patera_inferior numeric,
  barra_seguidora1_superior numeric,
  barra_seguidora1_medio numeric,
  barra_seguidora1_inferior numeric,
  barra_seguidora2_superior numeric,
  barra_seguidora2_medio numeric,
  barra_seguidora2_inferior numeric,
  barra_seguidora3_superior numeric,
  barra_seguidora3_medio numeric,
  barra_seguidora3_inferior numeric,
  barra_seguidora4_superior numeric,
  barra_seguidora4_medio numeric,
  barra_seguidora4_inferior numeric,
  barra_seguidora5_superior numeric,
  barra_seguidora5_medio numeric,
  barra_seguidora5_inferior numeric,
  comentarios text,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. TABLA: EVENTOS / HALLAZGOS (events)
create table if not exists public.events (
  id text primary key,
  date date not null,
  title text not null,
  description text,
  responsible text,
  photo_url text,
  closed smallint default 0,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. TABLA: INVENTARIOS (inventory_records)
create table if not exists public.inventory_records (
  id text primary key,
  date date not null,
  observations jsonb default '{}'::jsonb,
  stock_data jsonb default '{}'::jsonb,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. TABLA: DESCARTE DE ACEROS (steel_discards)
create table if not exists public.steel_discards (
  id text primary key,
  date date not null,
  serie text,
  equipo text,
  diametro text,
  fecha_postura date,
  fecha_descarte date,
  tipo_acero text,
  causa_descarte text,
  metros numeric,
  terreno text,
  medidas jsonb default '{}'::jsonb,
  photos jsonb default '{}'::jsonb,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. TABLA: CHECKLISTS DE EQUIPOS (checklists)
create table if not exists public.checklists (
  id text primary key,
  type text not null,
  date date not null,
  horometro text,
  operador text,
  perforadora text,
  cantidad_aceros text,
  obs_aceros text,
  items jsonb default '{}'::jsonb,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- Permite acceso a usuarios autenticados para lectura, inserción y actualización
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.shift_reports enable row level security;
alter table public.steel_changes enable row level security;
alter table public.steel_measurements enable row level security;
alter table public.events enable row level security;
alter table public.inventory_records enable row level security;
alter table public.steel_discards enable row level security;
alter table public.checklists enable row level security;

-- Políticas para profiles
drop policy if exists "Perfiles visibles por usuarios autenticados" on public.profiles;
create policy "Perfiles visibles por usuarios autenticados"
  on public.profiles for select using (auth.role() = 'authenticated');

drop policy if exists "Usuarios pueden actualizar su propio perfil" on public.profiles;
create policy "Usuarios pueden actualizar su propio perfil"
  on public.profiles for update using (auth.uid() = id);

-- Función helper para crear políticas CRUD para tablas de datos
do $$
declare
  t text;
  tables text[] := array['shift_reports', 'steel_changes', 'steel_measurements', 'events', 'inventory_records', 'steel_discards', 'checklists'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "Lectura autenticada en %1$I" on public.%1$I', t);
    execute format('create policy "Lectura autenticada en %1$I" on public.%1$I for select using (auth.role() = ''authenticated'')', t);

    execute format('drop policy if exists "Insercion autenticada en %1$I" on public.%1$I', t);
    execute format('create policy "Insercion autenticada en %1$I" on public.%1$I for insert with check (auth.role() = ''authenticated'')', t);

    execute format('drop policy if exists "Actualizacion autenticada en %1$I" on public.%1$I', t);
    execute format('create policy "Actualizacion autenticada en %1$I" on public.%1$I for update using (auth.role() = ''authenticated'')', t);

    execute format('drop policy if exists "Eliminacion autenticada en %1$I" on public.%1$I', t);
    execute format('create policy "Eliminacion autenticada en %1$I" on public.%1$I for delete using (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- ==============================================================================
-- 11. STORAGE BUCKET PARA FOTOS (lomasbayas-media)
-- ==============================================================================
insert into storage.buckets (id, name, public)
values ('lomasbayas-media', 'lomasbayas-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Acceso publico lectura lomasbayas-media" on storage.objects;
create policy "Acceso publico lectura lomasbayas-media"
  on storage.objects for select using (bucket_id = 'lomasbayas-media');

drop policy if exists "Subida autenticada lomasbayas-media" on storage.objects;
create policy "Subida autenticada lomasbayas-media"
  on storage.objects for insert with check (
    bucket_id = 'lomasbayas-media' and auth.role() = 'authenticated'
  );

drop policy if exists "Actualizacion autenticada lomasbayas-media" on storage.objects;
create policy "Actualizacion autenticada lomasbayas-media"
  on storage.objects for update using (
    bucket_id = 'lomasbayas-media' and auth.role() = 'authenticated'
  );
