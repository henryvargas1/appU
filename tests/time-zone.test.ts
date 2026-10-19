import { describe, expect, it } from "vitest";
import { parseSpanishDate } from "../shared/capture-parser";
import { addDaysIn, parseLocalDateTime, startOfDayIn, wallClock, zonedDate } from "../shared/tz";
import { planSessions, reminderSchedule, startOfWeek } from "../server/planner";

const BOGOTA = "America/Bogota"; // UTC-5, sin horario de verano
const MADRID = "Europe/Madrid"; // con horario de verano
// Lunes 19 oct 2026, 02:00 UTC = domingo 18 oct, 21:00 en Bogotá.
const now = new Date(Date.UTC(2026, 9, 19, 2, 0));

describe("utilidades de zona horaria", () => {
  it("convierte entre hora de pared e instante", () => {
    expect(zonedDate(BOGOTA, 2026, 9, 23, 10).toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(wallClock(now, BOGOTA)).toMatchObject({ day: 18, hour: 21, weekday: 0 });
    expect(startOfDayIn(now, BOGOTA).toISOString()).toBe("2026-10-18T05:00:00.000Z");
  });

  it("respeta el cambio de horario de verano", () => {
    // 25 oct 2026: Madrid pasa de UTC+2 a UTC+1.
    expect(zonedDate(MADRID, 2026, 9, 24, 9).toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(addDaysIn(zonedDate(MADRID, 2026, 9, 24, 9), 2, MADRID).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("interpreta fechas locales de la IA", () => {
    expect(parseLocalDateTime("2026-11-17T08:30", BOGOTA)?.toISOString()).toBe("2026-11-17T13:30:00.000Z");
    expect(parseLocalDateTime("2026-11-17T08:30Z", BOGOTA)?.toISOString()).toBe("2026-11-17T08:30:00.000Z");
    expect(parseLocalDateTime("mañana", BOGOTA)).toBeNull();
  });
});

describe("fechas relativas en la zona del estudiante", () => {
  it("“el viernes a las 10” son las 10 en Bogotá aunque el servidor esté en UTC", () => {
    expect(parseSpanishDate("examen el viernes a las 10", now, BOGOTA)?.toISOString()).toBe("2026-10-23T15:00:00.000Z");
  });

  it("“mañana” se calcula desde el día local (domingo en Bogotá)", () => {
    expect(parseSpanishDate("entrega mañana", now, BOGOTA)?.toISOString()).toBe("2026-10-19T14:00:00.000Z");
  });
});

describe("planificador en la zona del estudiante", () => {
  it("agenda sesiones a la hora de estudio local", () => {
    const sessions = planSessions(
      [{ id: 1, title: "Ensayo", dueAt: zonedDate(BOGOTA, 2026, 9, 24, 9), complexity: 4, priority: "high", estimatedMinutes: 180 }],
      { now: zonedDate(BOGOTA, 2026, 9, 19, 8), timeZone: BOGOTA, startHour: 17 },
    );
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => wallClock(session.scheduledFor, BOGOTA).hour >= 17)).toBe(true);
    expect(wallClock(sessions[0].scheduledFor, BOGOTA)).toMatchObject({ day: 19, hour: 17, minute: 0 });
  });

  it("el aviso del día llega a las 7:30 locales", () => {
    const due = zonedDate(BOGOTA, 2026, 10, 17, 14);
    const morning = reminderSchedule(due, now, BOGOTA).find((item) => item.stage === "due")!;
    expect(wallClock(morning.date, BOGOTA)).toMatchObject({ day: 17, hour: 7, minute: 30 });
  });

  it("la semana empieza el lunes local", () => {
    expect(startOfWeek(now, BOGOTA).toISOString()).toBe("2026-10-12T05:00:00.000Z");
  });
});
