import { DomainValidationError } from "./errors";
import type {
  PaySettings,
  RemunerationModel,
  RoundingModel,
  WorkBlock,
} from "./types";

const TRAINING_UNIT_MINUTES = 45;
const TIME_HOUR_MINUTES = 60;
/** Common denominator for cent fractions produced by 45- and 60-minute rates. */
export const EARNINGS_SUBCENT_SCALE = 180;

function assertRate(rate: number, source: string): void {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new DomainValidationError(
      "INVALID_RATE",
      `${source} muss eine nichtnegative Zahl sein.`,
    );
  }

  if (Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-8) {
    throw new DomainValidationError(
      "INVALID_RATE_PRECISION",
      `${source} darf höchstens zwei Nachkommastellen haben.`,
    );
  }
}

export function roundBillableMinutes(
  workMinutes: number,
  rounding: RoundingModel,
): number {
  if (!Number.isInteger(workMinutes) || workMinutes < 0) {
    throw new DomainValidationError(
      "INVALID_WORK_MINUTES",
      "Arbeitsminuten müssen eine nichtnegative ganze Zahl sein.",
    );
  }

  switch (rounding) {
    case "exact":
      return workMinutes;
    case "nearest-5":
      return Math.round(workMinutes / 5) * 5;
    case "nearest-15":
      return Math.round(workMinutes / 15) * 15;
    case "started-training-unit":
      return Math.ceil(workMinutes / TRAINING_UNIT_MINUTES) * TRAINING_UNIT_MINUTES;
    case "completed-training-units":
      return Math.floor(workMinutes / TRAINING_UNIT_MINUTES) * TRAINING_UNIT_MINUTES;
    default: {
      const exhaustiveCheck: never = rounding;
      throw new DomainValidationError(
        "INVALID_ROUNDING_MODEL",
        `Unbekanntes Rundungsmodell: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

export function minutesPerRemunerationUnit(model: RemunerationModel): number {
  switch (model) {
    case "time-hour":
      return TIME_HOUR_MINUTES;
    case "training-hour":
      return TRAINING_UNIT_MINUTES;
    default: {
      const exhaustiveCheck: never = model;
      throw new DomainValidationError(
        "INVALID_REMUNERATION_MODEL",
        `Unbekanntes Vergütungsmodell: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

export function resolveEffectiveRate(
  block: WorkBlock,
  settings: PaySettings,
): number {
  assertRate(settings.standardRate, "Standardvergütung");
  for (const [categoryId, rate] of Object.entries(settings.categoryRates ?? {})) {
    assertRate(rate, `Vergütung für Kategorie ${categoryId}`);
  }

  if (block.rateOverride !== undefined) {
    assertRate(block.rateOverride, "Abweichende Vergütung");
    return block.rateOverride;
  }

  if (
    block.categoryId !== undefined &&
    settings.categoryRates !== undefined &&
    Object.prototype.hasOwnProperty.call(settings.categoryRates, block.categoryId)
  ) {
    return settings.categoryRates[block.categoryId];
  }

  return settings.standardRate;
}

export function calculateEarningsCents(
  billableMinutes: number,
  rate: number,
  model: RemunerationModel,
): number {
  return Math.round(
    calculateEarningsSubcentUnits(billableMinutes, rate, model) /
      EARNINGS_SUBCENT_SCALE,
  );
}

export function calculateEarningsSubcentUnits(
  billableMinutes: number,
  rate: number,
  model: RemunerationModel,
): number {
  if (!Number.isInteger(billableMinutes) || billableMinutes < 0) {
    throw new DomainValidationError(
      "INVALID_BILLABLE_MINUTES",
      "Abrechenbare Minuten müssen eine nichtnegative ganze Zahl sein.",
    );
  }
  assertRate(rate, "Vergütung");

  const rateCents = Math.round(rate * 100);
  const unitMinutes = minutesPerRemunerationUnit(model);
  const result =
    rateCents * billableMinutes * (EARNINGS_SUBCENT_SCALE / unitMinutes);

  if (!Number.isSafeInteger(result)) {
    throw new DomainValidationError(
      "EARNINGS_OUT_OF_RANGE",
      "Der berechnete Verdienst liegt außerhalb des sicheren Zahlenbereichs.",
    );
  }

  return result;
}
