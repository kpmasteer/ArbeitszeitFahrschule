import { calculateAttendanceMinutes, calculateBreakMinutes, validateIsoDate } from "./date-time";
import {
  EARNINGS_SUBCENT_SCALE,
  calculateEarningsSubcentUnits,
  minutesPerRemunerationUnit,
  resolveEffectiveRate,
  roundBillableMinutes,
} from "./remuneration";
import type { PaySettings, WorkBlock, WorkBlockCalculation } from "./types";

export function calculateWorkBlock(
  block: WorkBlock,
  settings: PaySettings,
): WorkBlockCalculation {
  validateIsoDate(block.date);

  const attendanceMinutes = calculateAttendanceMinutes(block.startTime, block.endTime);
  const breakMinutes = calculateBreakMinutes(
    block.startTime,
    block.endTime,
    block.breaks,
  );
  const workMinutes = attendanceMinutes - breakMinutes;
  const isPaid = block.isPaid !== false;
  const effectiveRate = resolveEffectiveRate(block, settings);
  const billableMinutes = isPaid
    ? roundBillableMinutes(workMinutes, settings.rounding)
    : 0;
  const earningsSubcentUnits = isPaid
    ? calculateEarningsSubcentUnits(billableMinutes, effectiveRate, settings.model)
    : 0;
  const earningsCents = Math.round(
    earningsSubcentUnits / EARNINGS_SUBCENT_SCALE,
  );

  return {
    blockId: block.id,
    date: block.date,
    categoryId: block.categoryId,
    attendanceMinutes,
    breakMinutes,
    workMinutes,
    paidMinutes: isPaid ? workMinutes : 0,
    paidWorkMinutes: isPaid ? workMinutes : 0,
    timeHours: workMinutes / 60,
    trainingHours: workMinutes / 45,
    billableMinutes,
    billableUnits: billableMinutes / minutesPerRemunerationUnit(settings.model),
    remunerationModel: settings.model,
    effectiveRate,
    isPaid,
    earningsSubcentUnits,
    earningsCents,
    earningsEuro: earningsCents / 100,
  };
}
