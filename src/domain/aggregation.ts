import { calculateWorkBlock } from "./calculation";
import { DomainValidationError } from "./errors";
import { validateIsoDate } from "./date-time";
import { EARNINGS_SUBCENT_SCALE } from "./remuneration";
import type {
  AggregateTotals,
  CategorySummary,
  DaySummary,
  MonthSummary,
  PaySettings,
  WorkBlock,
  WorkBlockCalculation,
  YearSummary,
} from "./types";

export const UNASSIGNED_CATEGORY_ID = "__unassigned__";

interface MutableTotals {
  attendanceMinutes: number;
  breakMinutes: number;
  workMinutes: number;
  paidWorkMinutes: number;
  billableMinutes: number;
  earningsSubcentUnits: number;
  workBlockCount: number;
}

function emptyMutableTotals(): MutableTotals {
  return {
    attendanceMinutes: 0,
    breakMinutes: 0,
    workMinutes: 0,
    paidWorkMinutes: 0,
    billableMinutes: 0,
    earningsSubcentUnits: 0,
    workBlockCount: 0,
  };
}

function addCalculation(
  totals: MutableTotals,
  calculation: WorkBlockCalculation,
): void {
  totals.attendanceMinutes += calculation.attendanceMinutes;
  totals.breakMinutes += calculation.breakMinutes;
  totals.workMinutes += calculation.workMinutes;
  totals.paidWorkMinutes += calculation.paidWorkMinutes;
  totals.billableMinutes += calculation.billableMinutes;
  totals.earningsSubcentUnits += calculation.earningsSubcentUnits;
  totals.workBlockCount += 1;
}

function finalizeTotals(
  totals: MutableTotals,
  workDayCount: number,
): AggregateTotals {
  const earningsCents = Math.round(
    totals.earningsSubcentUnits / EARNINGS_SUBCENT_SCALE,
  );
  return {
    ...totals,
    timeHours: totals.workMinutes / 60,
    trainingHours: totals.workMinutes / 45,
    earningsCents,
    earningsEuro: earningsCents / 100,
    workDayCount,
  };
}

function assertMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new DomainValidationError(
      "INVALID_MONTH",
      `Monat muss im Format YYYY-MM vorliegen: ${month}`,
    );
  }
}

function createDaySummary(
  date: string,
  calculations: readonly WorkBlockCalculation[],
): DaySummary {
  const mutable = emptyMutableTotals();
  calculations.forEach((calculation) => addCalculation(mutable, calculation));
  return {
    date,
    calculations,
    ...finalizeTotals(mutable, calculations.length > 0 ? 1 : 0),
  };
}

export function aggregateMonth(
  blocks: readonly WorkBlock[],
  settings: PaySettings,
  month: string,
): MonthSummary {
  assertMonth(month);

  const calculations = blocks
    .filter((block) => {
      validateIsoDate(block.date);
      return block.date.startsWith(`${month}-`);
    })
    .map((block) => calculateWorkBlock(block, settings));

  const calculationsByDay = new Map<string, WorkBlockCalculation[]>();
  for (const calculation of calculations) {
    const day = calculationsByDay.get(calculation.date) ?? [];
    day.push(calculation);
    calculationsByDay.set(calculation.date, day);
  }

  const days = Array.from(calculationsByDay.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayCalculations]) => createDaySummary(date, dayCalculations));

  const monthTotals = emptyMutableTotals();
  calculations.forEach((calculation) => addCalculation(monthTotals, calculation));

  const categoryCalculations = new Map<string, WorkBlockCalculation[]>();
  for (const calculation of calculations) {
    const categoryId = calculation.categoryId ?? UNASSIGNED_CATEGORY_ID;
    const entries = categoryCalculations.get(categoryId) ?? [];
    entries.push(calculation);
    categoryCalculations.set(categoryId, entries);
  }

  const byCategory: Record<string, CategorySummary> = {};
  for (const [categoryId, entries] of categoryCalculations.entries()) {
    const categoryTotals = emptyMutableTotals();
    entries.forEach((entry) => addCalculation(categoryTotals, entry));
    byCategory[categoryId] = {
      categoryId,
      ...finalizeTotals(
        categoryTotals,
        new Set(entries.map((entry) => entry.date)).size,
      ),
    };
  }

  return {
    month,
    days,
    byCategory,
    ...finalizeTotals(monthTotals, days.length),
  };
}

export function aggregateYear(
  blocks: readonly WorkBlock[],
  settings: PaySettings,
  year: number,
): YearSummary {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new DomainValidationError(
      "INVALID_YEAR",
      "Jahr muss eine ganze Zahl zwischen 1 und 9999 sein.",
    );
  }

  const yearPrefix = `${String(year).padStart(4, "0")}-`;
  const yearBlocks = blocks.filter((block) => {
    validateIsoDate(block.date);
    return block.date.startsWith(yearPrefix);
  });

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${yearPrefix}${String(index + 1).padStart(2, "0")}`;
    return aggregateMonth(yearBlocks, settings, month);
  });

  const totals = emptyMutableTotals();
  for (const month of months) {
    totals.attendanceMinutes += month.attendanceMinutes;
    totals.breakMinutes += month.breakMinutes;
    totals.workMinutes += month.workMinutes;
    totals.paidWorkMinutes += month.paidWorkMinutes;
    totals.billableMinutes += month.billableMinutes;
    totals.earningsSubcentUnits += month.earningsSubcentUnits;
    totals.workBlockCount += month.workBlockCount;
  }

  const activeMonths = months.filter((month) => month.workBlockCount > 0);
  const activeMonthCount = activeMonths.length;
  const strongestMonthByWork = activeMonths.reduce<MonthSummary | null>(
    (strongest, month) =>
      strongest === null || month.workMinutes > strongest.workMinutes
        ? month
        : strongest,
    null,
  );
  const strongestMonthByEarnings = activeMonths.reduce<MonthSummary | null>(
    (strongest, month) =>
      strongest === null ||
      month.earningsSubcentUnits > strongest.earningsSubcentUnits
        ? month
        : strongest,
    null,
  );
  const workDayCount = months.reduce(
    (sum, month) => sum + month.workDayCount,
    0,
  );

  return {
    year,
    months,
    activeMonthCount,
    averageWorkMinutesPerCalendarMonth: totals.workMinutes / 12,
    averageEarningsCentsPerCalendarMonth:
      totals.earningsSubcentUnits / EARNINGS_SUBCENT_SCALE / 12,
    averageWorkMinutesPerActiveMonth:
      activeMonthCount === 0 ? 0 : totals.workMinutes / activeMonthCount,
    averageEarningsCentsPerActiveMonth:
      activeMonthCount === 0
        ? 0
        : totals.earningsSubcentUnits /
          EARNINGS_SUBCENT_SCALE /
          activeMonthCount,
    strongestMonthByWork: strongestMonthByWork?.month ?? null,
    strongestMonthByEarnings: strongestMonthByEarnings?.month ?? null,
    ...finalizeTotals(totals, workDayCount),
  };
}
