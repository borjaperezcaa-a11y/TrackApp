"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
});

export type ProfileState = { error?: string; ok?: boolean; message?: string };

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
  const { count: emittedCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true });
  const locked = (emittedCount ?? 0) > 0;

  const numbering = locked
    ? {}
    : {
        serie,
        num_inicial: d.num_inicial > 0 ? d.num_inicial : null,
        num_inicial_anio: d.num_inicial > 0 ? new Date().getFullYear() : null,
        num_inicial_serie: d.num_inicial > 0 ? serie : null,
      };

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
      ...numbering,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[saveProfile] error:", error.code, error.message);
    return { error: "No se pudieron guardar los datos." };
  }

  revalidatePath("/ajustes/perfil");
  revalidatePath("/");
  return { ok: true, message: "Datos guardados." };
}
