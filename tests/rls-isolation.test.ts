/**
 * Tests DETERMINISTAS de aislamiento multi-tenant (RLS + Storage).
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifican que un usuario A NUNCA puede leer / editar / borrar datos de un
 * usuario B en ninguna tabla ni bucket, ni suplantarle al insertar, ni facturar
 * sus viajes vía RPC. Es la red de seguridad que convierte "lo auditamos una vez"
 * en "no se puede romper sin que el CI se ponga rojo".
 *
 * RLS se aplica en Postgres, no se puede mockear → REQUIEREN una base Supabase
 * REAL. Apunta SIEMPRE a un proyecto de PRUEBAS o a un Supabase LOCAL, NUNCA a
 * producción (los tests crean y borran filas).
 *
 * Se ACTIVAN solo si están todas estas variables de entorno; si falta alguna, el
 * bloque se OMITE (así `npm test` sigue verde sin BD):
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   TEST_A_EMAIL  TEST_A_PASSWORD
 *   TEST_B_EMAIL  TEST_B_PASSWORD
 *
 * Preparación (una sola vez, en el proyecto de pruebas):
 *   1) Aplica TODAS las migraciones de supabase/migrations.
 *   2) Crea dos usuarios (A y B) — desde el panel de Supabase, o por signUp con
 *      el CAPTCHA desactivado en ese proyecto.
 *   3) Exporta las variables y ejecuta:  npm run test:rls
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const A = { email: process.env.TEST_A_EMAIL, password: process.env.TEST_A_PASSWORD };
const B = { email: process.env.TEST_B_EMAIL, password: process.env.TEST_B_PASSWORD };
const configured = Boolean(URL && ANON && A.email && A.password && B.email && B.password);

const TIMEOUT = 30_000;
const suite = configured ? describe : describe.skip;

suite("Aislamiento multi-tenant (RLS) — A nunca accede a datos de B", () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId = "";
  let bId = "";
  const cleanup: Array<() => unknown> = [];

  beforeAll(async () => {
    a = createClient(URL!, ANON!, { auth: { persistSession: false } });
    b = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const [ra, rb] = await Promise.all([
      a.auth.signInWithPassword({ email: A.email!, password: A.password! }),
      b.auth.signInWithPassword({ email: B.email!, password: B.password! }),
    ]);
    if (ra.error || rb.error) {
      throw new Error(`No se pudieron autenticar los usuarios de prueba: ${ra.error?.message ?? rb.error?.message}`);
    }
    aId = ra.data.user!.id;
    bId = rb.data.user!.id;
    expect(aId, "A y B deben ser usuarios distintos").not.toBe(bId);
  }, TIMEOUT);

  afterAll(async () => {
    for (const fn of cleanup.reverse()) {
      try {
        await fn();
      } catch {
        /* best-effort */
      }
    }
    await Promise.allSettled([a?.auth.signOut(), b?.auth.signOut()]);
  }, TIMEOUT);

  type Row = Record<string, unknown>;

  /** B crea una fila; A no debe leerla, editarla, borrarla ni suplantar a B. */
  async function tablaAislada(table: string, row: Row, patch: Row) {
    const { data: ins, error: insErr } = await b.from(table).insert(row).select("id").single();
    expect(insErr, `B debería poder insertar en ${table}`).toBeNull();
    const id = (ins as { id: string }).id;
    cleanup.push(() => b.from(table).delete().eq("id", id));

    const { data: read } = await a.from(table).select("id").eq("id", id).maybeSingle();
    expect(read, `A NO debe LEER la fila de B en ${table}`).toBeNull();

    const { data: upd } = await a.from(table).update(patch).eq("id", id).select("id");
    expect(upd ?? [], `A NO debe ACTUALIZAR la fila de B en ${table}`).toHaveLength(0);

    const { data: del } = await a.from(table).delete().eq("id", id).select("id");
    expect(del ?? [], `A NO debe BORRAR la fila de B en ${table}`).toHaveLength(0);

    const { error: forge } = await a.from(table).insert({ ...row, user_id: bId }).select("id").single();
    expect(forge, `A NO debe poder insertar con user_id de B en ${table}`).not.toBeNull();

    const { data: still } = await b.from(table).select("id").eq("id", id).maybeSingle();
    expect((still as { id: string } | null)?.id, `la fila de B debe seguir intacta en ${table}`).toBe(id);
  }

  it("clients", () => tablaAislada("clients", { nombre: "RLS-B SL", nif: "B00000000" }, { nombre: "HACKEADO" }), TIMEOUT);
  it("trips", () => tablaAislada("trips", { fecha: "2026-01-02", origen: "A", destino: "B", importe: 100 }, { importe: 1 }), TIMEOUT);
  it("expenses", () => tablaAislada("expenses", { fecha: "2026-01-02", categoria: "Otro", total: 10 }, { total: 1 }), TIMEOUT);
  it("incomes", () => tablaAislada("incomes", { fecha: "2026-01-02", concepto: "x", total: 10 }, { total: 1 }), TIMEOUT);
  it(
    "external_invoices",
    () => tablaAislada("external_invoices", { numero: "RLS-1", fecha: "2026-01-02", base: 10, iva: 0, irpf: 0, total: 10 }, { total: 1 }),
    TIMEOUT,
  );
  it("vehiculos", () => tablaAislada("vehiculos", { nombre: "Camión B", matricula: "0000BBB" }, { nombre: "HACKEADO" }), TIMEOUT);

  it(
    "profiles (perfil ajeno): A no lee ni edita el de B; sí ve el suyo",
    async () => {
      const { data: read } = await a.from("profiles").select("user_id").eq("user_id", bId).maybeSingle();
      expect(read, "A NO debe LEER el perfil de B").toBeNull();
      const { data: upd } = await a.from("profiles").update({ nombre: "HACKEADO" }).eq("user_id", bId).select("user_id");
      expect(upd ?? [], "A NO debe EDITAR el perfil de B").toHaveLength(0);
      const { data: mine } = await a.from("profiles").select("user_id").eq("user_id", aId).maybeSingle();
      expect((mine as { user_id: string } | null)?.user_id, "A SÍ debe ver su propio perfil (control positivo)").toBe(aId);
    },
    TIMEOUT,
  );

  it(
    "invoices + invoice_lines: B emite (RPC) y A no las ve",
    async () => {
      await b.from("profiles").update({ nombre: "Emisor B", nif: "12345678Z", serie: "RLST" }).eq("user_id", bId);
      const { data: cli } = await b.from("clients").insert({ nombre: "Cliente B", nif: "B11111111" }).select("id").single();
      const cliId = (cli as { id: string }).id;
      cleanup.push(() => b.from("clients").delete().eq("id", cliId));
      const { data: trip } = await b
        .from("trips")
        .insert({ fecha: "2026-01-02", origen: "X", destino: "Y", importe: 100, client_id: cliId })
        .select("id")
        .single();
      const tripId = (trip as { id: string }).id;
      cleanup.push(() => b.from("trips").delete().eq("id", tripId));

      const { data: inv, error: emitErr } = await b.rpc("emit_invoice_from_trips", { p_client_id: cliId, p_trip_ids: [tripId] });
      expect(emitErr, "B debería poder emitir su factura").toBeNull();
      const invId = (inv as { id: string }).id;

      const { data: rInv } = await a.from("invoices").select("id").eq("id", invId).maybeSingle();
      expect(rInv, "A NO debe LEER la factura de B").toBeNull();
      const { data: rLines } = await a.from("invoice_lines").select("id").eq("invoice_id", invId);
      expect(rLines ?? [], "A NO debe LEER las líneas de la factura de B").toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    "RPC emit: A no puede facturar viajes de B",
    async () => {
      const { data: cli } = await b.from("clients").insert({ nombre: "Cliente B2", nif: "B33333333" }).select("id").single();
      const cliId = (cli as { id: string }).id;
      cleanup.push(() => b.from("clients").delete().eq("id", cliId));
      const { data: trip } = await b
        .from("trips")
        .insert({ fecha: "2026-01-03", origen: "X", destino: "Y", importe: 50, client_id: cliId })
        .select("id")
        .single();
      const tripId = (trip as { id: string }).id;
      cleanup.push(() => b.from("trips").delete().eq("id", tripId));

      const { error } = await a.rpc("emit_invoice_from_trips", { p_client_id: cliId, p_trip_ids: [tripId] });
      expect(error, "A NO debe poder facturar un cliente/viaje de B").not.toBeNull();
    },
    TIMEOUT,
  );

  it(
    "Storage privado (recibos, facturas): A no lista ni descarga ni sube en la carpeta de B",
    async () => {
      const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
      for (const bucket of ["recibos", "facturas"]) {
        // B siembra un archivo en su carpeta
        const path = `${bId}/seed.png`;
        const { error: seedErr } = await b.storage.from(bucket).upload(path, png, { upsert: true });
        expect(seedErr, `B debería poder subir a ${bucket}/${bId}`).toBeNull();
        cleanup.push(() => b.storage.from(bucket).remove([path]));

        // A no lista la carpeta de B
        const { data: list } = await a.storage.from(bucket).list(bId);
        expect(list ?? [], `A NO debe LISTAR ${bucket}/${bId}`).toHaveLength(0);

        // A no descarga el archivo de B
        const { data: dl, error: dlErr } = await a.storage.from(bucket).download(path);
        expect(Boolean(dlErr) || dl == null, `A NO debe DESCARGAR ${bucket}/${path}`).toBe(true);

        // A no sube en la carpeta de B
        const { error: up } = await a.storage.from(bucket).upload(`${bId}/intruso.png`, png, { upsert: true });
        expect(up, `A NO debe SUBIR a ${bucket}/${bId}`).not.toBeNull();
      }
    },
    TIMEOUT,
  );

  it(
    "Storage logos (público para leer): A no escribe en la carpeta de B",
    async () => {
      const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
      const { error: up } = await a.storage.from("logos").upload(`${bId}/intruso.png`, png, { upsert: true });
      expect(up, "A NO debe SUBIR a logos/{B}").not.toBeNull();
    },
    TIMEOUT,
  );
});
