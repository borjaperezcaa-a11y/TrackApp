-- ============================================================================
-- TrackApp · 0002_rls.sql
-- Row-Level Security en TODAS las tablas: cada usuario solo ve/toca SUS datos.
-- Innegociable (sección 7 del brief).
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.trips         enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.expenses      enable row level security;

-- ─── PROFILES ───────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select using (user_id = auth.uid());
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- insert lo hace el trigger handle_new_user (security definer); no hace falta policy.

-- ─── CLIENTS ────────────────────────────────────────────────────────────────
create policy clients_all on public.clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── TRIPS ──────────────────────────────────────────────────────────────────
create policy trips_all on public.trips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── EXPENSES ───────────────────────────────────────────────────────────────
create policy expenses_all on public.expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── INVOICES ───────────────────────────────────────────────────────────────
-- Lectura: las propias. Inserción: SOLO vía emit_invoice_from_trips() (definer).
-- Actualización: permitida pero un trigger limita los cambios a `pagada`.
-- Borrado: prohibido (factura emitida = inmutable).
create policy invoices_select on public.invoices
  for select using (user_id = auth.uid());
create policy invoices_update on public.invoices
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── INVOICE_LINES ──────────────────────────────────────────────────────────
-- Solo lectura para el cliente; las escribe la función de emisión.
create policy invoice_lines_select on public.invoice_lines
  for select using (user_id = auth.uid());

-- ─── Inmutabilidad de facturas: solo `pagada` puede cambiar ────────────────
create or replace function public.enforce_invoice_immutable()
returns trigger language plpgsql as $$
begin
  if  new.numero            is distinct from old.numero
   or new.serie             is distinct from old.serie
   or new.anio              is distinct from old.anio
   or new.num               is distinct from old.num
   or new.chain_index       is distinct from old.chain_index
   or new.client_id         is distinct from old.client_id
   or new.fecha             is distinct from old.fecha
   or new.base              is distinct from old.base
   or new.iva_rate          is distinct from old.iva_rate
   or new.iva               is distinct from old.iva
   or new.irpf_rate         is distinct from old.irpf_rate
   or new.irpf              is distinct from old.irpf
   or new.total             is distinct from old.total
   or new.prev_hash         is distinct from old.prev_hash
   or new.huella            is distinct from old.huella
   or new.gen_ts            is distinct from old.gen_ts
   or new.emisor_snapshot   is distinct from old.emisor_snapshot
   or new.cliente_snapshot  is distinct from old.cliente_snapshot
  then
    raise exception 'Una factura emitida es inmutable: solo puede cambiar el estado de pago.';
  end if;
  return new;
end;
$$;

create trigger trg_invoices_immutable
  before update on public.invoices
  for each row execute function public.enforce_invoice_immutable();
