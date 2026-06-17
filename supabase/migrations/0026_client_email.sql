-- ============================================================================
-- TrackApp · 0026_client_email.sql
--   Email de contacto del cliente, para poder ENVIARLE la factura por correo.
--   De momento es solo un dato de la ficha; el envío automático aún no está
--   activado (la app prepara el botón pero no manda nada todavía).
-- ============================================================================

alter table public.clients add column if not exists email text;

comment on column public.clients.email is
  'Correo de contacto del cliente. Destino del envío de facturas (envío aún no activado).';
