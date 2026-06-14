/** Tipos de fila de la BD (espejo del esquema en supabase/migrations). */

export type Client = {
  id: string;
  user_id: string;
  nombre: string;
  nif: string | null;
  direccion: string | null;
  cp_localidad: string | null;
  condiciones_pago: string | null;
  created_at: string;
};

export type TripEstado = "pendiente" | "facturado";

export type Trip = {
  id: string;
  user_id: string;
  fecha: string;
  client_id: string | null;
  origen: string | null;
  destino: string | null;
  km: number | null;
  importe: number;
  estado: TripEstado;
  invoice_id: string | null;
  created_at: string;
};
