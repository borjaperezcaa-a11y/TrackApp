-- ============================================================================
-- TrackApp · 0016_external_invoices.sql
-- Facturas externas: las que la cooperativa emite EN NOMBRE del autónomo
-- (facturación por terceros, art. 5 RD 1619/2012). Son INGRESOS suyos, pero
-- NO las genera la app ni entran en la cadena Verifactu (las emite el sistema
-- de la coop). Aquí solo se REGISTRAN y ARCHIVAN para la contabilidad total.
--
-- Tabla separada de `invoices` a propósito: las facturas Verifactu son
-- inmutables y encadenadas; estas son editables y de numeración libre (la
-- serie/número los pone la cooperativa). No deben mezclarse.
-- ============================================================================

create table if not exists public.external_invoices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fuente       text not null default 'cooperativa' check (fuente in ('cooperativa','otra')),
  numero       text not null,                 -- número/serie tal cual lo asigna la coop
  fecha        date not null,
  cliente      text,                          -- destinatario / cliente final (texto libre)
  cliente_nif  text,
  concepto     text,
  base         numeric(12,2) not null default 0,
  iva_rate     numeric(5,2),
  iva          numeric(12,2) not null default 0,
  irpf_rate    numeric(5,2),
  irpf         numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,   -- base + iva - irpf
  cobrada      boolean not null default false,
  archivo_url  text,                          -- ruta en bucket privado 'facturas'
  qr_raw       text,                          -- payload del QR Verifactu si se escanea (futuro)
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists external_invoices_user_idx on public.external_invoices(user_id);

alter table public.external_invoices enable row level security;

create policy external_invoices_all on public.external_invoices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger trg_external_invoices_touch before update on public.external_invoices
  for each row execute function public.touch_updated_at();

-- Grants (las default privileges de 0008 ya cubren tablas futuras, pero se
-- explicita por claridad y por si la migración la corre otro rol).
grant select, insert, update, delete on public.external_invoices to authenticated;

-- ─── Bucket PRIVADO para el archivo de la factura externa (foto o PDF) ───────
-- A diferencia de 'recibos', admite PDF además de imagen (las coop suelen
-- mandar la factura en PDF). Solo el dueño accede a facturas/{user_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas', 'facturas', false, 10485760,  -- 10 MB, privado
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists facturas_select_own on storage.objects;
create policy facturas_select_own on storage.objects
  for select using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_insert_own on storage.objects;
create policy facturas_insert_own on storage.objects
  for insert with check (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_update_own on storage.objects;
create policy facturas_update_own on storage.objects
  for update using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_delete_own on storage.objects;
create policy facturas_delete_own on storage.objects
  for delete using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );
