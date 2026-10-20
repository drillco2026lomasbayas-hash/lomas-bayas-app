-- ==============================================================================
-- CONFIRMACIÓN DE USUARIOS INICIALES Y FUNCIÓN DE ADMINISTRADOR
-- Ejecuta este script en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Confirmar correos de drillcoadmin y applomas inmediatamente
update auth.users
set email_confirmed_at = now()
where email in ('drillcoadmin@lomasbayas.cl', 'applomas@lomasbayas.cl')
  and email_confirmed_at is null;

-- 2. Asegurar perfiles en public.profiles
insert into public.profiles (id, email, full_name, role)
select id, email, 'Administrador Drillco', 'admin'
from auth.users
where email = 'drillcoadmin@lomasbayas.cl'
on conflict (id) do update set role = 'admin', full_name = 'Administrador Drillco';

insert into public.profiles (id, email, full_name, role)
select id, email, 'Operativo Lomas Bayas', 'operador'
from auth.users
where email = 'applomas@lomasbayas.cl'
on conflict (id) do update set role = 'operador', full_name = 'Operativo Lomas Bayas';

-- 3. Permitir que el admin pueda leer todos los perfiles y actualizarlos
drop policy if exists "Admin puede ver y gestionar todos los perfiles" on public.profiles;
create policy "Admin puede ver y gestionar todos los perfiles"
  on public.profiles for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 4. Función RPC para que el Administrador cree cuentas operativas directamente
create or replace function public.admin_create_user(
  new_username text,
  new_password text,
  new_full_name text,
  new_role text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  caller_role text;
  new_email text;
  new_user_id uuid;
begin
  -- Verificar que quien llama es admin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role <> 'admin' then
    return jsonb_build_object('success', false, 'error', 'Solo administradores pueden crear cuentas');
  end if;

  -- Formatear email interno si se pasa un username simple
  if position('@' in new_username) = 0 then
    new_email := lower(trim(new_username)) || '@lomasbayas.cl';
  else
    new_email := lower(trim(new_username));
  end if;

  -- Verificar si el usuario ya existe
  if exists (select 1 from auth.users where email = new_email) then
    return jsonb_build_object('success', false, 'error', 'El usuario o email ya existe');
  end if;

  new_user_id := gen_random_uuid();

  -- Insertar usuario confirmado directamente en auth.users
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    new_email,
    crypt(new_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', new_full_name, 'role', new_role, 'username', new_username),
    now(),
    now()
  );

  -- Crear/actualizar perfil
  insert into public.profiles (id, email, full_name, role)
  values (new_user_id, new_email, new_full_name, new_role)
  on conflict (id) do update set
    full_name = new_full_name,
    role = new_role;

  return jsonb_build_object(
    'success', true,
    'user_id', new_user_id,
    'email', new_email,
    'username', new_username
  );
end;
$$;
