/** Carga de datos para emitir una factura desde el asistente (cliente → servidor). */

export type EmitLine = {
  trip_id: string | null;
  fecha: string; // YYYY-MM-DD
  origen: string;
  destino: string;
  cantidad: number;
  precio: number;
  // Concepto opcional del porte. Solo se envía si el usuario activa "mostrar
  // descripción en la factura"; si no, va vacío y no aparece en el PDF.
  descripcion?: string;
};

export type EmitEmisor = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  iban: string;
  logo_url: string;
};

export type EmitCliente = {
  nombre: string;
  nif: string;
  direccion: string;
  cp_localidad: string;
  condiciones_pago: string;
};

export type EmitPayload = {
  clientId: string;
  tripIds: string[];
  ivaRate: number;
  irpfRate: number;
  fecha: string; // YYYY-MM-DD
  formaPago: string;
  lines: EmitLine[];
  emisor: EmitEmisor;
  cliente: EmitCliente;
};

export type EmitResult = { error?: string; invoiceId?: string };
