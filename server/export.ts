// Exportación portable: calendario iCalendar (compatible con Apple Calendar) y Markdown.

export type CalendarItem = {
  uid: string;
  title: string;
  start: Date;
  durationMinutes?: number;
  description?: string;
  alarmsMinutesBefore?: number[];
};

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Pliega líneas a 75 octetos como exige RFC 5545. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const length = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + length > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildICalendar(items: CalendarItem[], options: { name?: string; now?: Date } = {}) {
  const stamp = formatUtc(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniFlow//Planificador académico//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name ?? "UniFlow")}`,
  ];
  for (const item of items) {
    const end = new Date(item.start.getTime() + (item.durationMinutes ?? 30) * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(item.start)}`,
      `DTEND:${formatUtc(end)}`,
      `SUMMARY:${escapeText(item.title)}`,
    );
    if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);
    for (const minutes of item.alarmsMinutesBefore ?? []) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(item.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(minutes))}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function buildMarkdownExport(data: {
  generatedAt: Date;
  subjects: Array<{ id: number; name: string }>;
  tasks: Array<{ title: string; status: string; dueAt: Date | null; subjectId: number | null; priority: string; description: string | null }>;
  notes: Array<{ title: string; content: string; subjectId: number | null; createdAt: Date }>;
}) {
  const subjectName = (id: number | null) => data.subjects.find((subject) => subject.id === id)?.name ?? "Sin materia";
  const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "sin fecha");
  const out = [`# UniFlow — exportación`, ``, `Generado: ${data.generatedAt.toISOString()}`, ``, `## Tareas`, ``];
  if (!data.tasks.length) out.push("_Sin tareas._", "");
  for (const task of data.tasks) {
    out.push(`- [${task.status === "completed" ? "x" : " "}] **${task.title}** — ${subjectName(task.subjectId)} · ${date(task.dueAt)} · prioridad ${task.priority}${task.status === "overdue" ? " · VENCIDA" : ""}`);
    if (task.description) out.push(`  - ${task.description.replace(/\n/g, " ")}`);
  }
  out.push("", "## Notas", "");
  if (!data.notes.length) out.push("_Sin notas._", "");
  for (const note of data.notes) {
    out.push(`### ${note.title}`, ``, `_${subjectName(note.subjectId)} · ${date(note.createdAt)}_`, ``, note.content, ``);
  }
  return out.join("\n");
}
