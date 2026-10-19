// Aritmética de fechas en la zona horaria del estudiante (IANA), sin dependencias.
// El servidor corre en UTC; "el viernes a las 10" debe significar las 10 en la hora del usuario.

export const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

/** Fecha y hora "de pared" de un instante en la zona indicada (month: 0-11, weekday: 0 = domingo). */
export function wallClock(date: Date, timeZone: string): WallClock {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: new Date(Date.UTC(year, month, day)).getUTCDay(),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const wall = wallClock(date, timeZone);
  return Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante que corresponde a una fecha/hora de pared en la zona (los desbordes de día/mes se normalizan). */
export function zonedDate(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0) {
  const naive = Date.UTC(year, month, day, hour, minute);
  let result = naive - offsetMs(new Date(naive), timeZone);
  // Segunda pasada para los cambios de horario de verano.
  result = naive - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

export function startOfDayIn(date: Date, timeZone: string) {
  const wall = wallClock(date, timeZone);
  return zonedDate(timeZone, wall.year, wall.month, wall.day);
}

export function addDaysIn(date: Date, days: number, timeZone: string) {
  const wall = wallClock(date, timeZone);
  return zonedDate(timeZone, wall.year, wall.month, wall.day + days, wall.hour, wall.minute);
}

export function atTimeIn(date: Date, hour: number, minute: number, timeZone: string) {
  const wall = wallClock(date, timeZone);
  return zonedDate(timeZone, wall.year, wall.month, wall.day, hour, minute);
}

export function sameDayIn(a: Date, b: Date, timeZone: string) {
  const x = wallClock(a, timeZone);
  const y = wallClock(b, timeZone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/** Interpreta "AAAA-MM-DDTHH:mm" como hora local del estudiante; respeta "Z" u offsets explícitos. */
export function parseLocalDateTime(value: string, timeZone: string) {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return null;
  return zonedDate(timeZone, Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 9), Number(match[5] ?? 0));
}

/** "AAAA-MM-DDTHH:mm" en la hora local del estudiante (para dar contexto a la IA). */
export function toLocalIso(date: Date, timeZone: string) {
  const wall = wallClock(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month + 1)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}
