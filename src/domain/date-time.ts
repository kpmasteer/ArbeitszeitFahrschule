import { DomainValidationError } from "./errors";
import type { ClockTime, IsoDate, WorkBreak } from "./types";

const MINUTES_PER_DAY = 24 * 60;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface NormalizedInterval {
  readonly start: number;
  readonly end: number;
}

export function parseClockTime(value: ClockTime): number {
  const match = CLOCK_TIME_PATTERN.exec(value);
  if (!match) {
    throw new DomainValidationError(
      "INVALID_CLOCK_TIME",
      `Uhrzeit muss im Format HH:mm vorliegen: ${value}`,
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new DomainValidationError(
      "INVALID_CLOCK_TIME",
      `Ungültige Uhrzeit: ${value}`,
    );
  }

  return hours * 60 + minutes;
}

export function validateIsoDate(value: IsoDate): void {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new DomainValidationError(
      "INVALID_DATE",
      `Datum muss im Format YYYY-MM-DD vorliegen: ${value}`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new DomainValidationError("INVALID_DATE", `Ungültiges Datum: ${value}`);
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

  if (day > daysInMonth) {
    throw new DomainValidationError("INVALID_DATE", `Ungültiges Datum: ${value}`);
  }
}

export function calculateAttendanceMinutes(
  startTime: ClockTime,
  endTime: ClockTime,
): number {
  const start = parseClockTime(startTime);
  const end = parseClockTime(endTime);

  if (start === end) {
    throw new DomainValidationError(
      "ZERO_LENGTH_WORK_BLOCK",
      "Beginn und Ende eines Arbeitsblocks dürfen nicht identisch sein.",
    );
  }

  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

function assertDurationBreak(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new DomainValidationError(
      "INVALID_BREAK_DURATION",
      "Eine einfache Pause muss eine nichtnegative ganze Minutenzahl haben.",
    );
  }
}

function normalizeIntervalBreak(
  startTime: ClockTime,
  endTime: ClockTime,
  blockStart: number,
  normalizedBlockEnd: number,
): NormalizedInterval {
  const rawStart = parseClockTime(startTime);
  const rawEnd = parseClockTime(endTime);

  if (rawStart === rawEnd) {
    throw new DomainValidationError(
      "ZERO_LENGTH_BREAK",
      "Beginn und Ende einer genauen Pause dürfen nicht identisch sein.",
    );
  }

  const start = rawStart < blockStart ? rawStart + MINUTES_PER_DAY : rawStart;
  const startDayOffset = start >= MINUTES_PER_DAY ? MINUTES_PER_DAY : 0;
  let end = rawEnd + startDayOffset;
  if (end <= start) {
    end += MINUTES_PER_DAY;
  }

  if (start < blockStart || end > normalizedBlockEnd) {
    throw new DomainValidationError(
      "BREAK_OUTSIDE_WORK_BLOCK",
      `Pause ${startTime}–${endTime} liegt nicht vollständig im Arbeitsblock.`,
    );
  }

  return { start, end };
}

export function calculateBreakMinutes(
  startTime: ClockTime,
  endTime: ClockTime,
  breaks: readonly WorkBreak[],
): number {
  const blockStart = parseClockTime(startTime);
  const attendanceMinutes = calculateAttendanceMinutes(startTime, endTime);
  const blockEnd = blockStart + attendanceMinutes;
  const intervals: NormalizedInterval[] = [];
  let durationBreakMinutes = 0;

  for (const workBreak of breaks) {
    if (workBreak.kind === "duration") {
      assertDurationBreak(workBreak.minutes);
      durationBreakMinutes += workBreak.minutes;
      continue;
    }

    intervals.push(
      normalizeIntervalBreak(
        workBreak.startTime,
        workBreak.endTime,
        blockStart,
        blockEnd,
      ),
    );
  }

  intervals.sort((left, right) => left.start - right.start);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) {
      throw new DomainValidationError(
        "OVERLAPPING_BREAKS",
        "Genaue Pausen innerhalb eines Arbeitsblocks dürfen sich nicht überschneiden.",
      );
    }
  }

  const intervalBreakMinutes = intervals.reduce(
    (sum, interval) => sum + interval.end - interval.start,
    0,
  );
  const total = durationBreakMinutes + intervalBreakMinutes;

  if (total > attendanceMinutes) {
    throw new DomainValidationError(
      "BREAKS_EXCEED_WORK_BLOCK",
      "Die gesamte Pausenzeit darf die Anwesenheitszeit nicht überschreiten.",
    );
  }

  return total;
}
