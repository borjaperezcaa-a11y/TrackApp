-- ============================================================================
-- TrackApp · 0022_incomes.sql
-- Ingresos manuales: el usuario los apunta a mano, igual que los gastos. NO son
-- facturas Verifactu y NO se envían a la AEAT; solo se guardan en su cuenta para
-- llevar la contabilidad total (junto con los ingresos de facturas). Editables.
-- ============================================================================

create table if not exists public.incomes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concepto   text,
  cliente    text,
  fecha      date,
  base       numeric(12,2),
  iva_rate   numeric(5,2),
  iva        numeric(12,2),
  total      numeric(12,2) not null default 0,
  cobrada    boolean not null default true,
  notas      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incomes_user_idx on public.incomes(user_id);

alter table public.incomes enable row level security;

create policy incomes_all on public.incomes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger trg_incomes_touch before update on public.incomes
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.incomes to authenticated;
