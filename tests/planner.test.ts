import { describe, expect, it } from "vitest";
import {
  dailyStudyMinutes,
  isAtRisk,
  planSessions,
  rankTasks,
  reminderSchedule,
  startOfWeek,
  type PlannableTask,
} from "../server/planner";

const now = new Date(2026, 9, 19, 10, 0, 0); // lunes 19 oct 2026, 10:00
const inDays = (days: number, hour = 9) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

let nextId = 1;
const task = (overrides: Partial<PlannableTask>): PlannableTask => ({
  id: nextId++,
  title: "Tarea",
  dueAt: null,
  complexity: 2,
  priority: "medium",
  estimatedMinutes: 30,
  ...overrides,
});

describe("dailyStudyMinutes", () => {
  it("no sugiere estudio sin tareas", () => {
    expect(dailyStudyMinutes([], now)).toBe(0);
  });

  it("sugiere un bloque corto de 15 min para una tarea sencilla y aislada", () => {
    expect(dailyStudyMinutes([task({ complexity: 1, dueAt: inDays(10) })], now)).toBe(15);
  });

  it("sube hasta 90 min cuando hay muchas tareas acumuladas", () => {
    const many = Array.from({ length: 9 }, (_, index) => task({ complexity: 3, estimatedMinutes: 120, dueAt: inDays(3 + index) }));
    expect(dailyStudyMinutes(many, now)).toBe(90);
  });

  it("aumenta con la complejidad y la cercanía de las fechas", () => {
    const far = dailyStudyMinutes([task({ complexity: 4, estimatedMinutes: 240, dueAt: inDays(14) }), task({ complexity: 2, dueAt: inDays(14) })], now);
    const near = dailyStudyMinutes([task({ complexity: 4, estimatedMinutes: 240, dueAt: inDays(2) }), task({ complexity: 2, dueAt: inDays(2) })], now);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(90);
  });
});

describe("rankTasks", () => {
  it("prioriza urgente y complejo, luego cercano, luego lo de bajo esfuerzo con margen", () => {
    const urgentComplex = task({ title: "urgente-complejo", complexity: 5, dueAt: inDays(1) });
    const near = task({ title: "cercano", complexity: 2, dueAt: inDays(2) });
    const easyFar = task({ title: "facil-lejano", complexity: 1, dueAt: inDays(20) });
    const ranked = rankTasks([easyFar, near, urgentComplex], now).map((item) => item.title);
    expect(ranked).toEqual(["urgente-complejo", "cercano", "facil-lejano"]);
  });
});

describe("planSessions", () => {
  it("reparte un trabajo complejo en sesiones progresivas antes de la fecha límite", () => {
    const essay = task({ title: "Ensayo", complexity: 5, estimatedMinutes: 300, dueAt: inDays(6) });
    const sessions = planSessions([essay], { now });
    expect(sessions.length).toBeGreaterThan(3);
    expect(sessions.every((session) => session.scheduledFor < essay.dueAt!)).toBe(true);
    expect(sessions.reduce((sum, session) => sum + session.durationMinutes, 0)).toBeGreaterThanOrEqual(300);
    expect(new Set(sessions.map((session) => session.scheduledFor.toDateString())).size).toBeGreaterThan(3);
  });

  it("usa la disponibilidad solo como límite de choque", () => {
    const work = task({ complexity: 4, estimatedMinutes: 400, dueAt: inDays(4) });
    const availability = [0, 0, 0, 0, 0, 0, 0];
    availability[now.getDay()] = 20; // hoy solo hay 20 minutos
    const sessions = planSessions([work], { now, availability });
    const today = sessions.filter((session) => session.scheduledFor.toDateString() === now.toDateString());
    expect(today.reduce((sum, session) => sum + session.durationMinutes, 0)).toBeLessThanOrEqual(20);
    const tomorrow = sessions.filter((session) => session.scheduledFor.toDateString() === inDays(1).toDateString());
    expect(tomorrow.reduce((sum, session) => sum + session.durationMinutes, 0)).toBeGreaterThan(20);
  });

  it("no programa sesiones en el pasado", () => {
    const sessions = planSessions([task({ estimatedMinutes: 60, dueAt: inDays(3) })], { now: new Date(2026, 9, 19, 21, 0), startHour: 17 });
    expect(sessions.every((session) => session.scheduledFor.getTime() >= new Date(2026, 9, 19, 21, 0).getTime())).toBe(true);
  });
});

describe("reminderSchedule", () => {
  it("crea avisos semanales y refuerzos para un examen lejano", () => {
    const schedule = reminderSchedule(inDays(28), now);
    expect(schedule.filter((item) => item.stage === "weekly").length).toBeGreaterThanOrEqual(3);
    expect(schedule.filter((item) => item.stage === "reinforced").length).toBeGreaterThanOrEqual(3);
    expect(schedule.some((item) => item.stage === "due")).toBe(true);
    expect(schedule.every((item) => item.date > now && item.date <= inDays(28))).toBe(true);
  });

  it("garantiza al menos tres avisos antes de una entrega cercana", () => {
    const schedule = reminderSchedule(inDays(1, 18), now);
    expect(schedule.filter((item) => item.stage !== "due").length).toBeGreaterThanOrEqual(3);
  });

  it("los avisos están ordenados y no se repiten", () => {
    const schedule = reminderSchedule(inDays(10), now);
    const times = schedule.map((item) => item.date.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("isAtRisk", () => {
  it("detecta cuando el trabajo restante no cabe antes de la entrega", () => {
    expect(isAtRisk(task({ estimatedMinutes: 300, dueAt: inDays(1, 20) }), now, 60)).toBe(true);
    expect(isAtRisk(task({ estimatedMinutes: 30, dueAt: inDays(5) }), now, 60)).toBe(false);
  });
});

describe("startOfWeek", () => {
  it("devuelve el lunes de la semana", () => {
    expect(startOfWeek(new Date(2026, 9, 22)).getDay()).toBe(1);
    expect(startOfWeek(new Date(2026, 9, 25)).getDate()).toBe(19);
  });
});
