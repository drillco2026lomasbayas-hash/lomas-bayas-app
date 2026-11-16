-- Migración para añadir columna de fotos en checklists (opcional si se desea a nivel de columna raíz)
-- El sistema guarda automáticamente las fotos en items->_photos con total compatibilidad.
alter table public.checklists add column if not exists photos jsonb default '[]'::jsonb;
