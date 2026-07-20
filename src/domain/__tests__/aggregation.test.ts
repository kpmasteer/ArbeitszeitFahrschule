import { describe, expect, it } from "vitest";

import {
  aggregateMonth,
  aggregateYear,
  UNASSIGNED_CATEGORY_ID,
  type PaySettings,
  type WorkBlock,
} from "..";

const settings: PaySettings = {
  model: "time-hour",
  standardRate: 30,
  rounding: "exact",
  categoryRates: {
    practice: 30,
    theory: 35,
  },
};

function block(
  id: string,
  date: string,
  startTime: string,
  endTime: string,
  categoryId?: string,
): WorkBlock {
  return {
    id,
    date,
    startTime,
    endTime,
    breaks: [],
    ...(categoryId === undefined ? {} : { categoryId }),
  };
}

const blocks: WorkBlock[] = [
  block("jul-1a", "2026-07-03", "08:00", "10:00", "practice"),
  block("jul-1b", "2026-07-03", "11:00", "12:00", "theory"),
  block("jul-2", "2026-07-31", "23:00", "01:00"),
  {
    ...block("aug-1", "2026-08-02", "08:00", "12:00", "practice"),
    rateOverride: 50,
  },
  block("other-year", "2025-07-03", "08:00", "09:00", "practice"),
];

describe("aggregateMonth", () => {
  it("aggregiert Tage, Blöcke, Kategorien und Geld", () => {
    const july = aggregateMonth(blocks, settings, "2026-07");

    expect(july.workBlockCount).toBe(3);
    expect(july.workDayCount).toBe(2);
    expect(july.attendanceMinutes).toBe(300);
    expect(july.workMinutes).toBe(300);
    expect(july.timeHours).toBe(5);
    expect(july.trainingHours).toBe(300 / 45);
    expect(july.earningsCents).toBe(15_500);
    expect(july.days.map((day) => day.date)).toEqual([
      "2026-07-03",
      "2026-07-31",
    ]);
    expect(july.days[0].workBlockCount).toBe(2);
    expect(july.byCategory.practice.workMinutes).toBe(120);
    expect(july.byCategory.theory.earningsCents).toBe(3_500);
    expect(july.byCategory[UNASSIGNED_CATEGORY_ID].workMinutes).toBe(120);
  });

  it("ordnet einen über Mitternacht laufenden Block dem Startmonat zu", () => {
    expect(aggregateMonth(blocks, settings, "2026-07").workMinutes).toBe(300);
    expect(aggregateMonth(blocks, settings, "2026-08").workMinutes).toBe(240);
  });

  it("liefert für einen leeren Monat stabile Nullwerte", () => {
    const empty = aggregateMonth(blocks, settings, "2026-09");

    expect(empty.workBlockCount).toBe(0);
    expect(empty.workDayCount).toBe(0);
    expect(empty.earningsCents).toBe(0);
    expect(empty.days).toEqual([]);
    expect(empty.byCategory).toEqual({});
  });

  it("summiert exakte Unter-Cent-Werte und rundet erst die Monatssumme", () => {
    const oneMinuteBlocks = [
      block("tiny-1", "2026-07-01", "08:00", "08:01"),
      block("tiny-2", "2026-07-01", "09:00", "09:01"),
      block("tiny-3", "2026-07-01", "10:00", "10:01"),
    ];
    const trainingSettings: PaySettings = {
      model: "training-hour",
      standardRate: 24,
      rounding: "exact",
    };

    // 3 * (24 Euro / 45 Minuten) = exakt 1,60 Euro.
    expect(
      aggregateMonth(oneMinuteBlocks, trainingSettings, "2026-07")
        .earningsCents,
    ).toBe(160);
  });
});

describe("aggregateYear", () => {
  it("enthält zwölf Monate und aggregiert ausschließlich das gewählte Jahr", () => {
    const year = aggregateYear(blocks, settings, 2026);

    expect(year.months).toHaveLength(12);
    expect(year.months[0].month).toBe("2026-01");
    expect(year.months[11].month).toBe("2026-12");
    expect(year.workMinutes).toBe(540);
    expect(year.workBlockCount).toBe(4);
    expect(year.workDayCount).toBe(3);
    expect(year.activeMonthCount).toBe(2);
    expect(year.averageWorkMinutesPerCalendarMonth).toBe(45);
    expect(year.averageWorkMinutesPerActiveMonth).toBe(270);
    expect(year.strongestMonthByWork).toBe("2026-07");
    expect(year.strongestMonthByEarnings).toBe("2026-08");
  });

  it("verwendet bei Gleichstand den chronologisch ersten Monat", () => {
    const tied = [
      block("jan", "2026-01-01", "08:00", "09:00"),
      block("feb", "2026-02-01", "08:00", "09:00"),
    ];

    expect(aggregateYear(tied, settings, 2026).strongestMonthByWork).toBe(
      "2026-01",
    );
  });
});
