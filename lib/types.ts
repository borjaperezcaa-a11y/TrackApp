/** Tipos de fila de la BD (espejo del esquema en supabase/migrations). */

export type Client = {
  id: string;
  user_id: string;
  nombre: string;
  nif: string | null;
  direccion: string | null;
  cp_localidad: string | null;
  condiciones_pago: string | null;
  email: string | null;
  created_at: string;
};

export type TripEstado = "pendiente" | "facturado";

// Camión de la flota (varios por autónomo) — ver migración 0029.
export type Vehiculo = {
  id: string;
  user_id: string;
  nombre: string;
  matricula: string | null;
  activo: boolean;
  created_at: string;
};

// Viaje FÍSICO: el desplazamiento real del camión (km contados una sola vez).
// Agrupa varios portes (filas de `trips`) — ver migración 0027.
export type Viaje = {
  id: string;
  user_id: string;
  fecha: string;
  origen: string | null;
  destino: string | null;
  km: number | null;
  vehiculo_id: string | null;
  created_at: string;
};

// Trip = PORTE (unidad de facturación): cliente + ruta + importe. Puede pertenecer
// a un viaje físico (viaje_id) o ir suelto (viaje_id = null).
export type Trip = {
  id: string;
  user_id: string;
  fecha: string;
  client_id: string | null;
  viaje_id: string | null;
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

/** Ingreso manual: lo apunta el usuario, no es factura Verifactu ni va a la AEAT. */
export type Income = {
  id: string;
  user_id: string;
  concepto: string | null;
  cliente: string | null;
  fecha: string | null;
  base: number | null;
  iva_rate: number | null;
  iva: number | null;
  total: number;
  cobrada: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

/** Factura externa: emitida por la cooperativa en nombre del autónomo
 * (facturación por terceros). Ingreso suyo, registrado/archivado, fuera de
 * la cadena Verifactu. Numeración libre y editable. */
export type ExternalInvoice = {
  id: string;
  user_id: string;
  fuente: "cooperativa" | "otra"; // legado: ya no se usa en la app (ver `serie`)
  serie: string | null; // nombre de la serie dado por el usuario
  numero: string;
  fecha: string;
  cliente: string | null;
  cliente_nif: string | null;
  concepto: string | null;
  base: number;
  iva_rate: number | null;
  iva: number;
  irpf_rate: number | null;
  irpf: number;
  total: number;
  cobrada: boolean;
  archivo_url: string | null;
  qr_raw: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
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
