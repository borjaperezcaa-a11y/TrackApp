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
  descripcion: string | null;
  peso: number | null;
  peso_unidad: "t" | "kg";
  km: number | null;
  importe: number;
  estado: TripEstado;
  invoice_id: string | null;
  created_at: string;
};

export type EmisorSnapshot = {
  nombre: string | null;
  nif: string | null;
  direccion: string | null;
  cp_localidad: string | null;
  iban: string | null;
  logo_url: string | null;
  serie?: string | null;
};

export type ClienteSnapshot = {
  nombre: string | null;
  nif: string | null;
  direccion: string | null;
  cp_localidad: string | null;
  condiciones_pago: string | null;
};

export type Invoice = {
  id: string;
  user_id: string;
  numero: string;
  serie: string;
  anio: number;
  num: number;
  chain_index: number;
  client_id: string | null;
  fecha: string;
  forma_pago: string;
  base: number;
  iva_rate: number;
  iva: number;
  irpf_rate: number;
  irpf: number;
  total: number;
  prev_hash: string | null;
  huella: string;
  gen_ts: string;
  qr: string | null;
  emisor_snapshot: EmisorSnapshot;
  cliente_snapshot: ClienteSnapshot;
  pagada: boolean;
  emitida_at: string;
  tipo: string; // "F1" normal, "R1" rectificativa
  rectifica_id: string | null;
  motivo: string | null;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  trip_id: string | null;
  fecha: string | null;
  origen: string | null;
  destino: string | null;
  descripcion: string | null;
  cantidad: number;
  precio: number;
  importe: number;
  orden: number;
};
