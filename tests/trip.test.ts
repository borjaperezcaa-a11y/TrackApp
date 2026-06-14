import { describe, it, expect } from "vitest";
import { eurPerKm, profitability } from "@/lib/trip";

describe("rentabilidad de viaje", () => {
  it("€/km", () => {
    expect(eurPerKm(1240, 940)).toBeCloseTo(1.319, 3);
    expect(eurPerKm(100, 0)).toBeNull();
    expect(eurPerKm(100, null)).toBeNull();
  });

  it("etiquetas según €/km (alineadas con el mockup)", () => {
    expect(profitability(1.32)?.label).toBe("Rentable");
    expect(profitability(1.05)?.label).toBe("Rentable");
    expect(profitability(0.89)?.label).toBe("Ajustado");
    expect(profitability(0.6)?.label).toBe("Flojo");
    expect(profitability(null)).toBeNull();
  });
});
