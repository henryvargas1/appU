// Motor de prioridad, carga diaria, sesiones y recordatorios de UniFlow.
// Funciones puras: no tocan la base de datos para poder probarlas de forma aislada.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Priority = "low" | "medium" | "high" | "critical";

export type PlannableTask = {
  id: number;
  title: string;
  dueAt: Date | null;
  complexity: number;
  priority: Priority;
  estimatedMinutes: number;
  /** Minutos ya invertidos en sesiones completadas. */
  spentMinutes?: number;
  /** Pasos pendientes del trabajo (0 si no se dividió). */
  stepsRemaining?: number;
};

export type PlannedSession = {
  taskId: number;
  title: string;
  scheduledFor: Date;
  durationMinutes: number;
};

const PRIORITY_WEIGHT: Record<Priority, number> = { low: 1, medium: 2, high: 4, critical: 5 };

export function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function roundTo5(value: number) {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Días (fraccionarios) hasta la fecha límite; 30 si no tiene fecha. */
export function daysUntil(dueAt: Date | null, now: Date) {
  if (!dueAt) return 30;
  return (dueAt.getTime() - now.getTime()) / DAY;
}

/** 0 (sin presión) a 5 (vence hoy o ya venció). */
export function urgencyScore(dueAt: Date | null, now: Date) {
  if (!dueAt) return 0;
  const days = daysUntil(dueAt, now);
  if (days <= 1) return 5;
  if (days <= 3) return 4;
  if (days <= 7) return 3;
  if (days <= 14) return 2;
  return 1;
}

/** Días de estudio utilizables antes de la entrega (el día de la entrega cuenta solo si vence de noche). */
export function studyDaysLeft(dueAt: Date | null, now: Date) {
  if (!dueAt) return 14;
  const days = Math.round((startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / DAY) + (dueAt.getHours() >= 20 ? 1 : 0);
  return clamp(days, 1, 14);
}

export function remainingMinutes(task: PlannableTask) {
  return Math.max(0, task.estimatedMinutes - (task.spentMinutes ?? 0));
}

/**
 * Puntuación de prioridad: primero lo urgente y complejo, después lo cercano y
 * finalmente lo de baja complejidad o con más margen.
 */
export function scoreTask(task: PlannableTask, now: Date) {
  const urgency = urgencyScore(task.dueAt, now);
  const complexity = clamp(task.complexity, 1, 5);
  const steps = Math.min(5, task.stepsRemaining ?? 0);
  // El producto premia la combinación urgente + complejo por encima de cada factor aislado.
  return urgency * complexity * 2 + urgency * 3 + complexity * 2 + PRIORITY_WEIGHT[task.priority] + steps;
}

export function rankTasks<T extends PlannableTask>(tasks: T[], now: Date) {
  return tasks
    .map((task) => ({ ...task, score: scoreTask(task, now), urgency: urgencyScore(task.dueAt, now) }))
    .sort((a, b) => b.score - a.score || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
}

/**
 * Minutos de estudio recomendados para hoy. Depende de complejidad, urgencia,
 * cantidad de tareas acumuladas, cercanía de fechas y pasos restantes.
 * La disponibilidad del usuario NO interviene aquí: solo recorta después.
 */
export function dailyStudyMinutes(tasks: PlannableTask[], now: Date) {
  const active = tasks.filter((task) => remainingMinutes(task) > 0);
  if (!active.length) return 0;

  // Ritmo necesario: lo que falta repartido entre los días disponibles.
  const pace = active.reduce((sum, task) => {
    const days = studyDaysLeft(task.dueAt, now);
    const weight = 1 + (clamp(task.complexity, 1, 5) - 1) * 0.15 + Math.min(5, task.stepsRemaining ?? 0) * 0.05;
    return sum + (remainingMinutes(task) / days) * weight;
  }, 0);

  const single = active.length === 1 ? active[0] : null;
  if (single && single.complexity <= 2 && urgencyScore(single.dueAt, now) <= 3) return 15;

  // Carga acumulada: muchas tareas elevan el piso diario.
  const accumulationFloor = active.length >= 8 ? 90 : active.length >= 5 ? 60 : active.length >= 3 ? 30 : 15;
  return clamp(roundTo5(Math.max(pace, accumulationFloor)), 15, 90);
}

/** Bloque sugerido para una tarea en una sesión. */
export function suggestedBlockMinutes(task: PlannableTask, now: Date) {
  const remaining = remainingMinutes(task);
  if (remaining <= 0) return 0;
  const perDay = remaining / studyDaysLeft(task.dueAt, now);
  const max = task.complexity >= 4 ? 60 : task.complexity === 3 ? 45 : 30;
  return clamp(roundTo5(Math.max(perDay, 15)), 15, Math.min(max, roundTo5(Math.max(15, remaining))));
}

/** Indica si el trabajo restante ya no cabe con el ritmo diario disponible antes de la entrega. */
export function isAtRisk(task: PlannableTask, now: Date, dailyMinutes = 90) {
  if (!task.dueAt) return false;
  const remaining = remainingMinutes(task);
  if (remaining <= 0) return false;
  const days = daysUntil(task.dueAt, now);
  if (days <= 0) return true;
  return remaining > Math.max(1, Math.floor(days)) * dailyMinutes * 0.5;
}

export function escalatePriority(priority: Priority): Priority {
  return priority === "low" ? "medium" : priority === "medium" ? "high" : "critical";
}

/**
 * Distribuye sesiones progresivas hasta la fecha límite.
 * `availability[weekday]` son los minutos máximos de ese día (0 = sin límite definido).
 */
export function planSessions(
  tasks: PlannableTask[],
  options: { now: Date; availability?: number[]; horizonDays?: number; startHour?: number },
): PlannedSession[] {
  const { now, availability = [], horizonDays = 14, startHour = 17 } = options;
  const pending = tasks.map((task) => ({ ...task, spentMinutes: task.spentMinutes ?? 0 })).filter((task) => remainingMinutes(task) > 0);
  const sessions: PlannedSession[] = [];
  const today = startOfDay(now);

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = addDays(today, offset);
    const dayNow = offset === 0 ? now : day;
    const open = pending.filter((task) => remainingMinutes(task) > 0 && (!task.dueAt || task.dueAt.getTime() > day.getTime()));
    if (!open.length) continue;

    const load = dailyStudyMinutes(open, dayNow);
    const limit = availability[day.getDay()] ?? 0;
    let budget = limit > 0 ? Math.min(load, limit) : load;
    let cursor = new Date(day);
    cursor.setHours(startHour, 0, 0, 0);
    if (offset === 0 && cursor.getTime() < now.getTime()) {
      cursor = new Date(Math.ceil(now.getTime() / (15 * MINUTE)) * 15 * MINUTE);
    }

    for (const task of rankTasks(open, dayNow)) {
      if (budget < 15) break;
      const source = pending.find((item) => item.id === task.id)!;
      const block = Math.min(suggestedBlockMinutes(source, dayNow), budget);
      if (block < 15) continue;
      // La sesión debe terminar antes de la fecha límite.
      if (source.dueAt && cursor.getTime() + block * MINUTE > source.dueAt.getTime()) continue;
      sessions.push({ taskId: task.id, title: task.title, scheduledFor: new Date(cursor), durationMinutes: block });
      source.spentMinutes += block;
      budget -= block;
      cursor = new Date(cursor.getTime() + (block + 10) * MINUTE);
    }
  }
  return sessions;
}

export type ReminderStage = "weekly" | "reinforced" | "due";

/**
 * Secuencia progresiva: avisos semanales cuando hay tiempo, refuerzos al acercarse
 * y, siempre que se pueda, al menos tres avisos antes de la fecha más el aviso del día.
 */
export function reminderSchedule(dueAt: Date, now: Date) {
  const due = dueAt.getTime();
  const result: Array<{ date: Date; stage: ReminderStage }> = [];
  const seen = new Set<number>();
  const add = (time: number, stage: ReminderStage) => {
    if (time > now.getTime() + MINUTE && time <= due && !seen.has(time)) {
      seen.add(time);
      result.push({ date: new Date(time), stage });
    }
  };

  let weekly = 0;
  for (let time = due - 7 * DAY; time > now.getTime() && weekly < 8; time -= 7 * DAY, weekly++) add(time, "weekly");
  add(due - 3 * DAY, "reinforced");
  add(due - 2 * DAY, "reinforced");
  add(due - DAY, "reinforced");
  // Aviso del día: a primera hora si la entrega es más tarde, o en el momento de la entrega.
  const morning = new Date(dueAt);
  morning.setHours(7, 30, 0, 0);
  add(morning.getTime() < due - HOUR ? morning.getTime() : due, "due");

  const beforeDue = () => result.filter((item) => item.stage !== "due").length;
  for (const time of [due - 6 * HOUR, due - 3 * HOUR, due - 2 * HOUR, due - HOUR, due - 30 * MINUTE]) {
    if (beforeDue() >= 3) break;
    add(time, "reinforced");
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Inicio (lunes) de la semana que contiene `date`. */
export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const diff = (day.getDay() + 6) % 7;
  return addDays(day, -diff);
}
