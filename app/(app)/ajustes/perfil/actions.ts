"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nowMadrid } from "@/lib/format";
import { logEvent } from "@/lib/events";
import { isValidNIFOrCIF, isValidIBAN } from "@/lib/validation/fiscal";

const profileSchema = z.object({
  nombre: z.string().trim().max(120),
  nif: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || isValidNIFOrCIF(v), "NIF/CIF no válido"),
  direccion: z.string().trim().max(200),
  cp_localidad: z.string().trim().max(120),
  iban: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || isValidIBAN(v), "IBAN no válido"),
  iva_def: z.coerce.number().min(0, "IVA fuera de rango").max(100, "IVA fuera de rango"),
  irpf_def: z.coerce.number().min(0, "IRPF fuera de rango").max(100, "IRPF fuera de rango"),
  serie: z
    .string()
    .trim()
    .min(1, "La serie es obligatoria")
    .max(10)
    .regex(/^[A-Za-z0-9/_-]+$/, "Serie no válida (letras, números, / _ -)"),
  num_inicial: z.coerce
    .number()
    .int("El número debe ser entero")
    .min(0, "Número no válido")
    .max(9_999_999, "Número fuera de rango"),
  logo_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//i.test(v), "URL de logo no válida"),
  factura_plantilla: z.enum(["trackapp", "elegante", "moderna"]).catch("trackapp"),
});

export type ProfileState = { error?: string; ok?: boolean; message?: string };

/** Guarda al instante el estilo de factura (sin tener que pulsar "Guardar datos"). */
export async function setPlantillaAction(
  plantilla: "trackapp" | "elegante" | "moderna",
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };
  const valid = (["trackapp", "elegante", "moderna"] as const).includes(plantilla) ? plantilla : "trackapp";
  const { error } = await supabase.from("profiles").update({ factura_plantilla: valid }).eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar el estilo." };
  revalidatePath("/ajustes/perfil");
  revalidatePath("/facturas");
  return { ok: true };
}

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a entrar." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const d = parsed.data;
  const serie = d.serie.toUpperCase();

  // La numeración de arranque (serie + nº inicial) solo se puede tocar mientras
  // no haya facturas emitidas en la app: una vez iniciada la cadena, cambiarla
  // rompería la correlación (Verifactu lo exige). Lo verificamos en servidor.
  const { count: emittedCount, error: countErr } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  // Fail-closed: si no podemos verificar cuántas facturas hay, NO tocamos la
  // numeración (cambiarla con la cadena ya iniciada rompería la correlación
  // Verifactu). Es preferible un reintento a un cambio peligroso.
  if (countErr) {
    return { error: "No se pudo verificar la numeración. Inténtalo de nuevo en un momento." };
  }
  const locked = (emittedCount ?? 0) > 0;

  // Si está bloqueado, no se toca la numeración. Si no, se actualiza la serie
  // siempre, pero el "suelo" num_inicial solo se fija cuando el usuario indica
  // un número > 0: dejar el campo vacío PRESERVA el arranque ya guardado (antes
  // lo borraba en silencio). El año se calcula en zona España para que coincida
  // con extract(year from current_date) de Postgres al emitir.
  const numbering = locked
    ? {}
    : d.num_inicial > 0
      ? { serie, num_inicial: d.num_inicial, num_inicial_anio: nowMadrid().year, num_inicial_serie: serie }
      : { serie };

  const { error } = await supabase
    .from("profiles")
    .update({
      nombre: d.nombre || null,
      nif: d.nif ? d.nif.toUpperCase() : null,
      direccion: d.direccion || null,
      cp_localidad: d.cp_localidad || null,
      iban: d.iban ? d.iban.replace(/\s+/g, "").toUpperCase() : null,
      iva_def: d.iva_def,
      irpf_def: d.irpf_def,
      logo_url: d.logo_url || null,
      factura_plantilla: d.factura_plantilla,
      ...numbering,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[saveProfile] error:", error.code, error.message);
    return { error: "No se pudieron guardar los datos." };
  }

  // Evento: solo cuando se (re)configura el arranque de numeración.
  if (!locked && d.num_inicial > 0) {
    await logEvent(supabase, "numeracion_configurada", {
      detalle: { serie, num_inicial: d.num_inicial, anio: nowMadrid().year },
      entidad: "perfil",
    });
  }

  revalidatePath("/ajustes/perfil");
  revalidatePath("/");
  return { ok: true, message: "Datos guardados." };
}
