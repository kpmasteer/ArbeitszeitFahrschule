import { describe, expect, it } from "vitest";

import {
  calculateWorkBlock,
  DomainValidationError,
  type PaySettings,
  type WorkBlock,
} from "..";

const defaultSettings: PaySettings = {
  model: "time-hour",
  standardRate: 30,
  rounding: "exact",
};

function createBlock(overrides: Partial<WorkBlock> = {}): WorkBlock {
  return {
    id: "block-1",
    date: "2026-07-15",
    startTime: "08:00",
    endTime: "12:00",
    breaks: [],
    ...overrides,
  };
}

describe("calculateWorkBlock", () => {
  it("berechnet den spezifizierten 45-Minuten-Beispielfall centgenau", () => {
    const result = calculateWorkBlock(
      createBlock({
        endTime: "12:30",
        breaks: [{ kind: "duration", minutes: 30 }],
      }),
      {
        model: "training-hour",
        standardRate: 24,
        rounding: "exact",
      },
    );

    expect(result).toMatchObject({
      attendanceMinutes: 270,
      breakMinutes: 30,
      workMinutes: 240,
      timeHours: 4,
      trainingHours: 240 / 45,
      billableMinutes: 240,
      billableUnits: 240 / 45,
      earningsCents: 12_800,
      earningsEuro: 128,
    });
  });

  it("ordnet einen Block über Mitternacht vollständig dem Startdatum zu", () => {
    const result = calculateWorkBlock(
      createBlock({
        date: "2026-07-31",
        startTime: "21:30",
        endTime: "00:15",
      }),
      defaultSettings,
    );

    expect(result.date).toBe("2026-07-31");
    expect(result.attendanceMinutes).toBe(165);
    expect(result.workMinutes).toBe(165);
    expect(result.earningsCents).toBe(8_250);
  });

  it("addiert mehrere einfache und genaue Pausen, auch nach Mitternacht", () => {
    const result = calculateWorkBlock(
      createBlock({
        startTime: "21:30",
        endTime: "01:00",
        breaks: [
          { kind: "interval", startTime: "22:00", endTime: "22:15" },
          { kind: "interval", startTime: "00:15", endTime: "00:30" },
          { kind: "duration", minutes: 10 },
        ],
      }),
      defaultSettings,
    );

    expect(result.attendanceMinutes).toBe(210);
    expect(result.breakMinutes).toBe(40);
    expect(result.workMinutes).toBe(170);
  });

  it("weist genaue Pausen außerhalb des Blocks zurück", () => {
    expect(() =>
      calculateWorkBlock(
        createBlock({
          breaks: [
            { kind: "interval", startTime: "07:45", endTime: "08:15" },
          ],
        }),
        defaultSettings,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: "BREAK_OUTSIDE_WORK_BLOCK",
      }),
    );
  });

  it("weist sich überschneidende genaue Pausen zurück", () => {
    expect(() =>
      calculateWorkBlock(
        createBlock({
          breaks: [
            { kind: "interval", startTime: "09:00", endTime: "09:30" },
            { kind: "interval", startTime: "09:15", endTime: "09:45" },
          ],
        }),
        defaultSettings,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: "OVERLAPPING_BREAKS",
      }),
    );
  });

  it("weist mehr Pause als Anwesenheit zurück", () => {
    expect(() =>
      calculateWorkBlock(
        createBlock({
          endTime: "09:00",
          breaks: [{ kind: "duration", minutes: 61 }],
        }),
        defaultSettings,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: "BREAKS_EXCEED_WORK_BLOCK",
      }),
    );
  });

  it("behandelt identische Start- und Endzeiten nicht stillschweigend als 24 Stunden", () => {
    expect(() =>
      calculateWorkBlock(
        createBlock({ startTime: "08:00", endTime: "08:00" }),
        defaultSettings,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: "ZERO_LENGTH_WORK_BLOCK",
      }),
    );
  });

  it("validiert echte Kalendertage einschließlich Schaltjahren", () => {
    expect(() =>
      calculateWorkBlock(
        createBlock({ date: "2026-02-29" }),
        defaultSettings,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainValidationError>>({
        code: "INVALID_DATE",
      }),
    );

    expect(() =>
      calculateWorkBlock(
        createBlock({ date: "2028-02-29" }),
        defaultSettings,
      ),
    ).not.toThrow();
  });
});
