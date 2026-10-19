/** Zona horaria del dispositivo; el servidor la usa para interpretar fechas y planificar. */
export const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";

export function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function formatShortDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

export function formatLongDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Sin fecha definida";
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function formatTime(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Sin fecha";
  return `${formatShortDate(date)} · ${formatTime(date)}`;
}

export function weekdayLabel(value: Date = new Date()) {
  const text = new Intl.DateTimeFormat("es-CO", { weekday: "long" }).format(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function priorityLabel(priority: string) {
  return ({ low: "Baja", medium: "Media", high: "Alta", critical: "Urgente" } as Record<string, string>)[priority] ?? priority;
}

export function priorityTone(priority: string) {
  if (priority === "critical" || priority === "high") return "rose" as const;
  if (priority === "medium") return "amber" as const;
  return "sage" as const;
}

export function kindLabel(kind: string) {
  return ({ task: "Tarea", exam: "Examen", delivery: "Entrega", reminder: "Recordatorio", note: "Nota" } as Record<string, string>)[kind] ?? kind;
}

export function stageLabel(stage: string) {
  return ({ weekly: "Aviso semanal", reinforced: "Aviso reforzado", due: "Aviso del día" } as Record<string, string>)[stage] ?? stage;
}

export function dueHint(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Sin fecha";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (date.getTime() < Date.now()) return "Vencida";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

/** "AAAA-MM-DD" (y opcionalmente "HH:MM") en hora local. */
export function toDateInput(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInput(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseDateInput(day: string, time = "") {
  const match = day.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const clock = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), clock ? Number(clock[1]) : 9, clock ? Number(clock[2]) : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
