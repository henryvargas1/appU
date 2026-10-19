import { describe, expect, it } from "vitest";
import { detectType, parseSpanishDate, suggestFromText } from "../shared/capture-parser";
import { fallbackReply } from "../server/ai";
import { buildICalendar } from "../server/export";

const now = new Date(2026, 9, 19, 10, 0, 0); // lunes 19 oct 2026

const ymd = (date: Date | null) => (date ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : null);

describe("parseSpanishDate", () => {
  it.each([
    ["presentación de sociología el viernes", "2026-10-23"],
    ["examen mañana", "2026-10-20"],
    ["pasado mañana", "2026-10-21"],
    ["parcial el 17 de noviembre", "2026-11-17"],
    ["entrega 5/1", "2027-1-5"],
    ["examen el 2026-12-03", "2026-12-3"],
    ["taller en 3 días", "2026-10-22"],
    ["quiz el 25", "2026-10-25"],
    ["quiz el 5", "2026-11-5"],
    ["reunión el martes de la próxima semana", "2026-10-27"],
    ["a las 10 de la mañana, el 17 de noviembre", "2026-11-17"],
  ])("%s → %s", (text, expected) => {
    expect(ymd(parseSpanishDate(text, now))).toBe(expected);
  });

  it("respeta la hora indicada", () => {
    const date = parseSpanishDate("examen el viernes a las 3", now)!;
    expect(date.getHours()).toBe(15);
  });

  it("devuelve null si no hay fecha", () => {
    expect(parseSpanishDate("apuntes de derivadas parciales", now)).toBeNull();
  });
});

describe("suggestFromText", () => {
  it("clasifica un recordatorio de presentación como entrega con fecha y materia", () => {
    const suggestion = suggestFromText("Recordatorio: presentación de sociología el viernes", { now, subjects: [{ id: 7, name: "Sociología" }] });
    expect(suggestion.type).toBe("delivery");
    expect(suggestion.subjectId).toBe(7);
    expect(ymd(suggestion.dueAt)).toBe("2026-10-23");
    expect(suggestion.title).toBe("Presentación de sociología el viernes");
  });

  it("detecta exámenes con complejidad explícita y propone pasos", () => {
    const suggestion = suggestFromText("Examen de física el 17 de noviembre, complejidad 4", { now });
    expect(detectType("Examen de física")).toBe("exam");
    expect(suggestion.complexity).toBe(4);
    expect(suggestion.steps.length).toBeGreaterThan(0);
  });

  it("deja las notas sin fecha como notas", () => {
    expect(suggestFromText("La derivada mide la tasa de cambio instantánea.", { now }).type).toBe("note");
  });
});

describe("fallbackReply", () => {
  const base = { now, notes: [], subjects: [], planSummary: "Carga sugerida hoy: 30 min." };

  it("propone (no crea) una tarea cuando se pide desde el chat", () => {
    const reply = fallbackReply({ ...base, message: "Crea una tarea: taller de cálculo el viernes", tasks: [] });
    expect(reply.actions[0]).toMatchObject({ type: "create_task", title: "Taller de cálculo el viernes" });
  });

  it("propone cambiar la fecha de una tarea existente", () => {
    const tasks = [{ id: 3, title: "Ensayo de historia", dueAt: new Date(2026, 9, 21), complexity: 4, priority: "high", status: "pending", kind: "delivery", subjectName: null }];
    const reply = fallbackReply({ ...base, message: "mueve el ensayo de historia al viernes", tasks });
    expect(reply.actions[0]).toMatchObject({ type: "change_due_date", taskId: 3 });
  });

  it("responde qué hay esta semana con las tareas guardadas", () => {
    const tasks = [{ id: 1, title: "Parcial de cálculo", dueAt: new Date(2026, 9, 22), complexity: 4, priority: "high", status: "pending", kind: "exam", subjectName: "Cálculo" }];
    expect(fallbackReply({ ...base, message: "¿Qué tengo esta semana?", tasks }).answer).toContain("Parcial de cálculo");
  });

  it("busca lo que dijo el profesor en las notas", () => {
    const notes = [{ id: 1, title: "Clase 5", content: "El profesor dijo que el examen incluye integrales por partes.", subjectName: "Cálculo", createdAt: now }];
    expect(fallbackReply({ ...base, notes, tasks: [], message: "¿Qué dijo el profesor del examen?" }).answer).toContain("integrales");
  });
});

describe("buildICalendar", () => {
  it("genera un calendario válido con alarmas y texto escapado", () => {
    const ics = buildICalendar([{ uid: "task-1@uniflow", title: "Examen: Física, parte 1", start: new Date(Date.UTC(2026, 10, 17, 14)), durationMinutes: 120, alarmsMinutesBefore: [60] }], { now });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261117T140000Z");
    expect(ics).toContain("DTEND:20261117T160000Z");
    expect(ics).toContain("SUMMARY:Examen: Física\\, parte 1");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
});
