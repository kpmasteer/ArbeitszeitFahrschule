import { describe, expect, it } from "vitest";

import {
  calculateWorkBlock,
  roundBillableMinutes,
  type PaySettings,
  type WorkBlock,
} from "..";

function block(overrides: Partial<WorkBlock> = {}): WorkBlock {
  return {
    id: "pay-block",
    date: "2026-07-03",
    startTime: "08:00",
    endTime: "09:30",
    breaks: [],
    categoryId: "practice",
    ...overrides,
  };
}

function settings(overrides: Partial<PaySettings> = {}): PaySettings {
  return {
    model: "time-hour",
    standardRate: 30,
    rounding: "exact",
    categoryRates: { practice: 35 },
    ...overrides,
  };
}

describe("Vergütungsmodelle", () => {
  it("berechnet 90 Minuten im Zeitstundenmodell", () => {
    const result = calculateWorkBlock(
      block({ categoryId: undefined }),
      settings({ categoryRates: undefined }),
    );

    expect(result.billableUnits).toBe(1.5);
    expect(result.earningsCents).toBe(4_500);
  });

  it("berechnet 90 Minuten im Ausbildungsstundenmodell", () => {
    const result = calculateWorkBlock(
      block({ categoryId: undefined }),
      settings({
        model: "training-hour",
        standardRate: 22.5,
        categoryRates: undefined,
      }),
    );

    expect(result.billableUnits).toBe(2);
    expect(result.earningsCents).toBe(4_500);
  });

  it("wendet die Satzpriorität Eintrag vor Kategorie vor Standard an", () => {
    expect(calculateWorkBlock(block(), settings()).effectiveRate).toBe(35);
    expect(
      calculateWorkBlock(block({ rateOverride: 40 }), settings()).effectiveRate,
    ).toBe(40);
    expect(
      calculateWorkBlock(
        block({ categoryId: "office" }),
        settings(),
      ).effectiveRate,
    ).toBe(30);
  });

  it("setzt bei unvergüteten Blöcken bezahlte Zeit und Verdienst auf null", () => {
    const result = calculateWorkBlock(
      block({ isPaid: false, rateOverride: 99 }),
      settings(),
    );

    expect(result.workMinutes).toBe(90);
    expect(result.paidWorkMinutes).toBe(0);
    expect(result.billableMinutes).toBe(0);
    expect(result.earningsCents).toBe(0);
    expect(result.isPaid).toBe(false);
  });
});

describe("Rundung", () => {
  it.each([
    ["exact", 53],
    ["nearest-5", 55],
    ["nearest-15", 60],
    ["started-training-unit", 90],
    ["completed-training-units", 45],
  ] as const)("rundet 53 Minuten mit %s auf %i", (model, expected) => {
    expect(roundBillableMinutes(53, model)).toBe(expected);
  });

  it("rundet bei angefangenen Einheiten null Minuten nicht auf", () => {
    expect(roundBillableMinutes(0, "started-training-unit")).toBe(0);
  });
});

