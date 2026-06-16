"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidNIFOrCIF } from "@/lib/validation/fiscal";

const clientSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  nif: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || isValidNIFOrCIF(v), "NIF/CIF no válido"),
  direccion: z.string().trim().max(200),
  cp_localidad: z.string().trim().max(120),
  condiciones_pago: z.string().trim().max(120),
});

export type ClientState = { error?: string };

function parse(formData: FormData) {
  return clientSchema.safeParse(Object.fromEntries(formData));
}

function toRow(d: z.infer<typeof clientSchema>) {
  return {
    nombre: d.nombre,
    nif: d.nif ? d.nif.toUpperCase() : null,
    direccion: d.direccion || null,
    cp_localidad: d.cp_localidad || null,
    condiciones_pago: d.condiciones_pago || null,
  };
}

export async function createClientAction(
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase.from("clients").insert({ ...toRow(parsed.data), user_id: user.id });
  if (error) return { error: "No se pudo crear el cliente." };

  revalidatePath("/clientes");

  // Si venimos de otra pantalla (ingreso, viaje…), volver allí con el cliente
  // recién creado preseleccionado. `next` solo se acepta si es una ruta interna.
  const next = formData.get("next");
  if (typeof next === "string" && /^\/(?![/\\])/.test(next)) {
    revalidatePath(next);
    const sep = next.includes("?") ? "&" : "?";
    redirect(`${next}${sep}nuevoCliente=${encodeURIComponent(parsed.data.nombre)}`);
  }
  redirect("/clientes");
}

export type QuickClientResult = { id?: string; nombre?: string; error?: string };

/**
 * Crea un cliente con lo mínimo (nombre + NIF opcional) y DEVUELVE su id, para
 * crearlo desde un modal sin salir de otra pantalla (p. ej. el formulario de
 * viaje). No redirige: el llamador añade el cliente a su lista y lo selecciona.
 */
export async function quickCreateClient(input: {
  nombre: string;
  nif: string;
}): Promise<QuickClientResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = clientSchema.safeParse({
    nombre: input.nombre,
    nif: input.nif,
    direccion: "",
    cp_localidad: "",
    condiciones_pago: "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...toRow(parsed.data), user_id: user.id })
    .select("id, nombre")
    .single();
  if (error || !data) return { error: "No se pudo crear el cliente." };

  revalidatePath("/clientes");
  return { id: data.id as string, nombre: data.nombre as string };
}

export async function updateClientAction(
  id: string,
  _prev: ClientState,
  formData: FormData,
): Promise<ClientState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { error } = await supabase
    .from("clients")
    .update(toRow(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteClientAction(
  id: string,
  _prev: ClientState,
  _formData: FormData,
): Promise<ClientState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Integridad: no se borra un cliente con viajes o facturas asociados.
  const [
    { count: invoiceCount, error: invErr },
    { count: tripCount, error: tripErr },
  ] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", id).eq("user_id", user.id),
    supabase.from("trips").select("id", { count: "exact", head: true }).eq("client_id", id).eq("user_id", user.id),
  ]);

  // Si la comprobación falla, NO borrar (evita borrar un cliente con
  // dependencias por un error transitorio que dejaría count en null).
  if (invErr || tripErr) {
    return { error: "No se pudo comprobar si el cliente tiene datos asociados. Inténtalo de nuevo." };
  }

  if ((invoiceCount ?? 0) > 0) {
    return { error: "Este cliente tiene facturas emitidas; no se puede borrar." };
  }
  if ((tripCount ?? 0) > 0) {
    return { error: "Este cliente tiene viajes asociados. Bórralos o reasígnalos primero." };
  }

  const { error } = await supabase.from("clients").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el cliente." };

  revalidatePath("/clientes");
  redirect("/clientes");
}
