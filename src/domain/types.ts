export type IsoDate = string;
export type ClockTime = string;

export interface DurationBreak {
  readonly id?: string;
  readonly kind: "duration";
  readonly minutes: number;
}

export interface IntervalBreak {
  readonly id?: string;
  readonly kind: "interval";
  readonly startTime: ClockTime;
  readonly endTime: ClockTime;
}

export type WorkBreak = DurationBreak | IntervalBreak;

export interface WorkBlock {
  readonly id: string;
  /** Local calendar date to which the complete block belongs. */
  readonly date: IsoDate;
  readonly startTime: ClockTime;
  readonly endTime: ClockTime;
  readonly breaks: readonly WorkBreak[];
  readonly categoryId?: string;
  readonly rateOverride?: number;
  readonly isPaid?: boolean;
  readonly activity?: string;
  readonly vehicleClass?: string;
  readonly studentOrAssignment?: string;
  readonly notes?: string;
  readonly location?: string;
  readonly calendarText?: string;
}

export type RemunerationModel = "time-hour" | "training-hour";

export type RoundingModel =
  | "exact"
  | "nearest-5"
  | "nearest-15"
  | "started-training-unit"
  | "completed-training-units";

export interface PaySettings {
  /** Euro (or the configured currency) per 60- or 45-minute unit. */
  readonly standardRate: number;
  readonly model: RemunerationModel;
  readonly rounding: RoundingModel;
  readonly categoryRates?: Readonly<Record<string, number>>;
}

export interface WorkBlockCalculation {
  readonly blockId: string;
  readonly date: IsoDate;
  readonly categoryId?: string;
  readonly attendanceMinutes: number;
  readonly breakMinutes: number;
  readonly workMinutes: number;
  /** Alias intended for exports; zero for an unpaid block. */
  readonly paidMinutes: number;
  readonly paidWorkMinutes: number;
  readonly timeHours: number;
  readonly trainingHours: number;
  readonly billableMinutes: number;
  readonly billableUnits: number;
  readonly remunerationModel: RemunerationModel;
  readonly effectiveRate: number;
  readonly isPaid: boolean;
  /** Exact integer representation; 180 units equal one cent. */
  readonly earningsSubcentUnits: number;
  readonly earningsCents: number;
  readonly earningsEuro: number;
}

export interface AggregateTotals {
  readonly attendanceMinutes: number;
  readonly breakMinutes: number;
  readonly workMinutes: number;
  readonly paidWorkMinutes: number;
  readonly billableMinutes: number;
  readonly timeHours: number;
  readonly trainingHours: number;
  /** Exact sum before display rounding; 180 units equal one cent. */
  readonly earningsSubcentUnits: number;
  readonly earningsCents: number;
  readonly earningsEuro: number;
  readonly workBlockCount: number;
  readonly workDayCount: number;
}

export interface DaySummary extends AggregateTotals {
  readonly date: IsoDate;
  readonly calculations: readonly WorkBlockCalculation[];
}

export interface CategorySummary extends AggregateTotals {
  readonly categoryId: string;
}

export interface MonthSummary extends AggregateTotals {
  /** YYYY-MM */
  readonly month: string;
  readonly days: readonly DaySummary[];
  readonly byCategory: Readonly<Record<string, CategorySummary>>;
}

export interface YearSummary extends AggregateTotals {
  readonly year: number;
  /** Always contains January through December, including empty months. */
  readonly months: readonly MonthSummary[];
  readonly activeMonthCount: number;
  readonly averageWorkMinutesPerCalendarMonth: number;
  readonly averageEarningsCentsPerCalendarMonth: number;
  readonly averageWorkMinutesPerActiveMonth: number;
  readonly averageEarningsCentsPerActiveMonth: number;
  readonly strongestMonthByWork: string | null;
  readonly strongestMonthByEarnings: string | null;
}
