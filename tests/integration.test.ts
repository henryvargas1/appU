// Prueba de extremo a extremo del router contra una base MySQL real.
// Se ejecuta solo con TEST_DATABASE_URL (ej. mysql://u:p@localhost:3306/uniflow ya migrada).
import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("UniFlow de extremo a extremo", () => {
  type Caller = Awaited<ReturnType<typeof makeCaller>>;
  let a: Caller;
  let b: Caller;
  let db: typeof import("../server/db");

  async function makeCaller(openId: string) {
    db = await import("../server/db");
    const { appRouter } = await import("../server/routers");
    await db.upsertUser({ openId, name: openId });
    const user = (await db.getUserByOpenId(openId)) as User;
    const ctx = { user, req: { headers: {} }, res: { clearCookie: () => undefined } } as unknown as TrpcContext;
    return appRouter.createCaller(ctx);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const suffix = Date.now();
    a = await makeCaller(`test-a-${suffix}`);
    b = await makeCaller(`test-b-${suffix}`);
  });

  it("la bandeja sugiere sin crear tareas y la confirmación crea tarea, recordatorios y sesiones", async () => {
    const calc = await a.subject.create({ name: "Cálculo" });
    const result = await a.inbox.analyze({ kind: "text", content: "Examen de cálculo el viernes, complejidad 4" });
    expect(result.suggestion.type).toBe("exam");
    expect(result.suggestion.subjectId).toBe(calc.id);
    expect(result.suggestion.dueAt).not.toBeNull();
    expect(await a.task.list()).toHaveLength(0);
    expect((await a.inbox.list()).map((entry) => entry.id)).toContain(result.entry.id);

    const { task } = await a.inbox.confirm({
      entryId: result.entry.id,
      type: "exam",
      title: "Parcial de cálculo",
      subjectId: calc.id,
      dueAt: new Date(Date.now() + 10 * 86_400_000),
      complexity: 4,
      steps: ["Repasar derivadas", "Resolver taller"],
    });
    expect(task?.kind).toBe("exam");
    expect(await a.inbox.list()).toHaveLength(0);
    await expect(a.inbox.confirm({ entryId: result.entry.id, type: "note", title: "x" })).rejects.toThrow();

    const detail = await a.task.get({ taskId: task!.id });
    expect(detail.steps).toHaveLength(2);
    expect(detail.reminders.filter((item) => item.status === "scheduled").length).toBeGreaterThanOrEqual(4);
    expect(detail.sessions.length).toBeGreaterThan(0);

    const snapshot = await a.planner.snapshot();
    expect(snapshot.recommendedMinutes).toBeGreaterThan(0);
    expect(snapshot.tasks[0].id).toBe(task!.id);
  });

  it("aísla los datos entre usuarios", async () => {
    const [subject] = await a.subject.list();
    const [task] = await a.task.list();
    await expect(b.subject.detail({ subjectId: subject.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.task.get({ taskId: task.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.task.complete({ taskId: task.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.task.create({ title: "Robo", subjectId: subject.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [reminder] = await a.planner.reminders();
    await expect(b.reminder.done({ reminderId: reminder.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await b.task.list()).toHaveLength(0);
  });

  it("reprograma sesiones conservando el historial", async () => {
    const [task] = await a.task.list();
    const { sessions } = await a.task.get({ taskId: task.id });
    const original = sessions.find((session) => session.status === "planned")!;
    const { session } = await a.planner.rescheduleSession({ sessionId: original.id });
    expect(session.rescheduledFromId).toBe(original.id);
    const after = await a.task.get({ taskId: task.id });
    expect(after.sessions.find((item) => item.id === original.id)?.status).toBe("rescheduled");
    await a.planner.replan();
    expect((await a.task.get({ taskId: task.id })).sessions.some((item) => item.id === session.id)).toBe(true);
  });

  it("“Posponer” no supera la fecha límite y “Ya está hecho” detiene los avisos", async () => {
    const soon = await a.task.create({ title: "Entrega corta", dueAt: new Date(Date.now() + 2 * 86_400_000) });
    const soonReminder = (await a.planner.reminders()).find((item) => item.taskId === soon.id)!;
    const clamped = await a.reminder.snooze({ reminderId: soonReminder.id, minutes: 7 * 24 * 60 });
    expect(new Date(clamped.scheduledFor).getTime()).toBe(soon.dueAt!.getTime());

    const [task] = (await a.task.list()).filter((item) => item.kind === "exam");
    const reminder = (await a.planner.reminders()).find((item) => item.taskId === task.id)!;
    const snoozed = await a.reminder.snooze({ reminderId: reminder.id, minutes: 60 });
    await a.reminder.done({ reminderId: snoozed.id });
    const detail = await a.task.get({ taskId: task.id });
    expect(detail.task.status).toBe("completed");
    expect(detail.reminders.some((item) => item.status === "scheduled" || item.status === "sent")).toBe(false);
  });

  it("la tarea programada marca vencidas y detiene la insistencia", async () => {
    const task = await a.task.create({ title: "Taller vencido", dueAt: new Date(Date.now() + 3 * 3_600_000) });
    const result = await db.processScheduledReminders(new Date(Date.now() + 4 * 3_600_000));
    expect(result.overdue).toBeGreaterThanOrEqual(1);
    const detail = await a.task.get({ taskId: task.id });
    expect(detail.task.status).toBe("overdue");
    expect(detail.reminders.every((item) => ["expired", "sent", "dismissed"].includes(item.status))).toBe(true);
    expect(detail.reminders.some((item) => item.status === "scheduled")).toBe(false);
  });

  it("el chat propone acciones y solo las aplica al confirmar", async () => {
    const before = (await a.task.list()).length;
    const reply = await a.chat.send({ message: "Crea una tarea: leer capítulo 3 mañana" });
    expect(reply.actions[0]).toMatchObject({ type: "create_task", status: "proposed" });
    expect(await a.task.list()).toHaveLength(before);
    const history = await a.chat.history();
    const message = history.messages.at(-1)!;
    await a.chat.resolveAction({ messageId: message.id, index: 0, accept: true });
    expect(await a.task.list()).toHaveLength(before + 1);
    await expect(a.chat.resolveAction({ messageId: message.id, index: 0, accept: true })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(b.chat.resolveAction({ messageId: message.id, index: 0, accept: true })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const week = await a.chat.send({ message: "¿Qué tengo esta semana?" });
    expect(week.answer).toContain("Leer capítulo 3");
  });

  it("busca, elimina lógicamente y exporta", async () => {
    const entry = await a.inbox.analyze({ kind: "text", content: "El profesor dijo que la regla de la cadena entra en el examen" });
    const { note } = await a.inbox.confirm({ entryId: entry.entry.id, type: "note", title: "Clase de derivadas" });
    const found = await a.note.search({ query: "cadena" });
    expect(found.notes.map((item) => item.id)).toContain(note!.id);
    expect((await b.note.search({ query: "cadena" })).notes).toHaveLength(0);

    const summarized = await a.note.summarize({ noteId: note!.id });
    expect(summarized.summary).toBeTruthy();

    const calendar = await a.export.calendar();
    expect(calendar.content).toContain("BEGIN:VEVENT");
    const markdown = await a.export.markdown();
    expect(markdown.content).toContain("Clase de derivadas");

    await a.note.delete({ noteId: note!.id });
    expect((await a.note.search({ query: "cadena" })).notes).toHaveLength(0);
    const exported = JSON.parse((await a.export.json()).content) as { notes: unknown[]; tasks: unknown[] };
    expect(exported.tasks.length).toBeGreaterThan(0);
  });

  it("guarda preferencias y la vista semanal agrupa por día", async () => {
    const prefs = await a.settings.update({ availability: [0, 30, 30, 30, 30, 30, 0], studyStartHour: 18 });
    expect(prefs.studyStartHour).toBe(18);
    const week = await a.planner.week({ weekStart: new Date() });
    expect(week).toHaveLength(7);
    const subject = (await a.subject.list())[0];
    await a.subject.archive({ subjectId: subject.id, archived: true });
    expect((await a.subject.list()).some((item) => item.id === subject.id)).toBe(false);
    expect((await a.subject.list({ includeArchived: true })).some((item) => item.id === subject.id)).toBe(true);
  });
});
