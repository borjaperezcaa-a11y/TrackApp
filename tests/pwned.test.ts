import { describe, it, expect, vi, afterEach } from "vitest";
import { isPwnedPassword } from "@/lib/validation/pwned";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix=5BAA6  suffix=1E4C9B93F3F0682250B6CF8331B7EE68FD8
const SUFFIX_PASSWORD = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function mockFetch(text: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, text: async () => text })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("isPwnedPassword", () => {
  it("detecta una contraseña filtrada (con CRLF como HIBP)", async () => {
    mockFetch(`${SUFFIX_PASSWORD}:99999\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n`);
    expect(await isPwnedPassword("password")).toBe(true);
  });

  it("no marca una contraseña que no está en el rango", async () => {
    mockFetch("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:7\r\n");
    expect(await isPwnedPassword("una-clave-larga-y-rara-2026")).toBe(false);
  });

  it("count 0 no cuenta como filtrada (padding)", async () => {
    mockFetch(`${SUFFIX_PASSWORD}:0\r\n`);
    expect(await isPwnedPassword("password")).toBe(false);
  });

  it("fail-open: si HIBP falla, no bloquea (false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    expect(await isPwnedPassword("password")).toBe(false);
  });
});
