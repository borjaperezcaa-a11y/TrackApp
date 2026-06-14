import { describe, it, expect } from "vitest";
import {
  isValidDNI,
  isValidNIE,
  isValidCIF,
  isValidNIFOrCIF,
  isValidIBAN,
} from "@/lib/validation/fiscal";

describe("validadores fiscales", () => {
  it("DNI: acepta los de la factura de referencia", () => {
    expect(isValidDNI("45872506H")).toBe(true); // emisor
    expect(isValidDNI("76825348N")).toBe(true); // cliente
    expect(isValidDNI("45872506A")).toBe(false); // letra incorrecta
    expect(isValidDNI("1234567Z")).toBe(false); // formato corto
  });

  it("NIE válido / inválido", () => {
    expect(isValidNIE("X1234567L")).toBe(true);
    expect(isValidNIE("Z1234567R")).toBe(true);
    expect(isValidNIE("X1234567A")).toBe(false);
  });

  it("CIF válido / inválido", () => {
    expect(isValidCIF("A58818501")).toBe(true);
    expect(isValidCIF("B30000000")).toBe(false);
  });

  it("NIF o CIF combinado", () => {
    expect(isValidNIFOrCIF("45872506H")).toBe(true);
    expect(isValidNIFOrCIF("A58818501")).toBe(true);
    expect(isValidNIFOrCIF("")).toBe(false);
    expect(isValidNIFOrCIF("hola")).toBe(false);
  });

  it("IBAN: acepta el de la factura (con y sin espacios)", () => {
    expect(isValidIBAN("ES13 0182 6050 6202 0156 7707")).toBe(true);
    expect(isValidIBAN("ES1301826050620201567707")).toBe(true);
    expect(isValidIBAN("ES00 0182 6050 6202 0156 7707")).toBe(false);
    expect(isValidIBAN("XX12")).toBe(false);
  });
});
