// Clasificador heurístico de capturas en español. Se usa como respaldo cuando la IA
// no está disponible y como pista inicial para la revisión del usuario.

export type CaptureType = "task" | "exam" | "delivery" | "reminder" | "note";
export type CapturePriority = "low" | "medium" | "high" | "critical";

export type CaptureSuggestion = {
  type: CaptureType;
  title: string;
  dueAt: Date | null;
  subjectId: number | null;
  subjectName: string | null;
  priority: CapturePriority;
  complexity: number;
  estimatedMinutes: number;
  concepts: string[];
  steps: string[];
  summary: string;
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

export function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function at(date: Date, hour: number, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function parseHour(text: string): { hour: number; minute: number } | null {
  const match = text.match(/\ba las (\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de la manana|de la tarde|de la noche)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3] ?? "";
  if ((suffix.startsWith("p") || suffix.includes("tarde") || suffix.includes("noche")) && hour < 12) hour += 12;
  if (!suffix && hour >= 1 && hour <= 6) hour += 12; // "a las 3" en contexto académico suele ser por la tarde
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Extrae una fecha de expresiones como "el viernes", "mañana", "17 de noviembre", "17/11" o "2026-11-17". */
export function parseSpanishDate(input: string, now: Date): Date | null {
  const text = normalize(input);
  const time = parseHour(text);
  const withTime = (date: Date) => (time ? at(date, time.hour, time.minute) : at(date, 9));
  const today = at(now, 0);

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return withTime(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : now.getFullYear();
    let date = new Date(year, Number(slash[2]) - 1, Number(slash[1]));
    if (!slash[3] && date < today) date = new Date(year + 1, Number(slash[2]) - 1, Number(slash[1]));
    return withTime(date);
  }

  for (const named of text.matchAll(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de|del)\s+(\d{4}))?/g)) {
    if (!(named[2] in MONTHS)) continue;
    const year = named[3] ? Number(named[3]) : now.getFullYear();
    let date = new Date(year, MONTHS[named[2]], Number(named[1]));
    if (!named[3] && date < today) date = new Date(year + 1, MONTHS[named[2]], Number(named[1]));
    return withTime(date);
  }

  if (/\bpasado manana\b/.test(text)) return withTime(new Date(today.getTime() + 2 * 86_400_000));
  if (/\bmanana\b/.test(text.replace(/\bde la manana\b/g, ""))) return withTime(new Date(today.getTime() + 86_400_000));
  if (/\bhoy\b|\besta (tarde|noche)\b/.test(text)) return withTime(today);

  const inDays = text.match(/\ben (\d{1,2}) dias?\b/);
  if (inDays) return withTime(new Date(today.getTime() + Number(inDays[1]) * 86_400_000));
  const inWeeks = text.match(/\ben (\d{1,2}|una|dos|tres) semanas?\b/);
  if (inWeeks) {
    const count = ({ una: 1, dos: 2, tres: 3 } as Record<string, number>)[inWeeks[1]] ?? Number(inWeeks[1]);
    return withTime(new Date(today.getTime() + count * 7 * 86_400_000));
  }

  const weekday = text.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b( de la proxima semana| de la semana que viene)?/);
  if (weekday) {
    const target = WEEKDAYS[weekday[1]];
    if (weekday[2]) {
      const nextMonday = ((1 - today.getDay() + 7) % 7) || 7;
      return withTime(new Date(today.getTime() + (nextMonday + ((target + 6) % 7)) * 86_400_000));
    }
    const diff = ((target - today.getDay() + 7) % 7) || 7;
    return withTime(new Date(today.getTime() + diff * 86_400_000));
  }

  if (/\b(la )?(proxima semana|semana que viene)\b/.test(text)) {
    const diff = ((1 - today.getDay() + 7) % 7) || 7;
    return withTime(new Date(today.getTime() + diff * 86_400_000));
  }

  const dayOnly = text.match(/\b(?:el|para el|hasta el)\s+(\d{1,2})\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      let date = new Date(now.getFullYear(), now.getMonth(), day);
      if (date < today) date = new Date(now.getFullYear(), now.getMonth() + 1, day);
      return withTime(date);
    }
  }
  return null;
}

export function detectType(input: string): CaptureType {
  const text = normalize(input);
  if (/\b(examen|parcial|quiz|prueba|evaluacion|final|test)\b/.test(text)) return "exam";
  if (/\b(entrega|entregar|presentacion|exposicion|proyecto|ensayo|informe|trabajo final|deadline)\b/.test(text)) return "delivery";
  if (/\b(recordatorio|recordar|no olvidar|acordarme)\b/.test(text)) return "reminder";
  if (/\b(tarea|taller|ejercicios?|leer|lectura|estudiar|repasar|resolver|hacer|terminar)\b/.test(text)) return "task";
  return "note";
}

function detectComplexity(text: string, type: CaptureType) {
  const explicit = text.match(/complejidad\s*(\d)/);
  if (explicit) return Math.min(5, Math.max(1, Number(explicit[1])));
  if (/\b(final|proyecto|tesis|trabajo final)\b/.test(text)) return 5;
  if (type === "exam" || /\b(ensayo|informe|presentacion|exposicion)\b/.test(text)) return 4;
  if (type === "delivery") return 3;
  if (/\b(leer|lectura|repasar)\b/.test(text)) return 2;
  return type === "note" || type === "reminder" ? 1 : 2;
}

function detectPriority(text: string, complexity: number, dueAt: Date | null, now: Date): CapturePriority {
  if (/\b(urgente|ya mismo|hoy sin falta)\b/.test(text)) return "critical";
  const days = dueAt ? (dueAt.getTime() - now.getTime()) / 86_400_000 : 30;
  if (days <= 1 && complexity >= 3) return "critical";
  if (days <= 3 || complexity >= 4) return "high";
  if (days <= 10 || complexity >= 3) return "medium";
  return "low";
}

function stepsFor(type: CaptureType, complexity: number) {
  if (complexity < 3) return [];
  if (type === "exam") return ["Reunir apuntes y temas del examen", "Resumir conceptos clave", "Resolver ejercicios de práctica", "Simulacro y repaso final"];
  if (type === "delivery") return ["Definir alcance y requisitos", "Investigar y reunir fuentes", "Escribir el primer borrador", "Revisar y entregar"];
  return ["Entender el enunciado", "Avanzar la parte principal", "Revisar y cerrar"];
}

function cleanTitle(input: string) {
  const firstLine = input.split(/\n/)[0].trim();
  const stripped = firstLine.replace(/^(recordatorio|recordar|nota|tarea)\s*:\s*/i, "").trim();
  const title = stripped || firstLine;
  return title.length > 120 ? `${title.slice(0, 117)}…` : title.charAt(0).toUpperCase() + title.slice(1);
}

export function suggestFromText(
  input: string,
  options: { now: Date; subjects?: Array<{ id: number; name: string }> },
): CaptureSuggestion {
  const { now, subjects = [] } = options;
  const text = normalize(input);
  const type = detectType(input);
  const dueAt = parseSpanishDate(input, now);
  const subject = subjects.find((item) => {
    const name = normalize(item.name);
    return text.includes(name) || name.split(/\s+/).some((word) => word.length > 4 && new RegExp(`\\b${word}\\b`).test(text));
  }) ?? null;
  const complexity = detectComplexity(text, type);
  const effectiveType = type === "note" && dueAt ? "task" : type;
  return {
    type: effectiveType,
    title: cleanTitle(input) || "Captura de clase",
    dueAt,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    priority: detectPriority(text, complexity, dueAt, now),
    complexity,
    estimatedMinutes: Math.max(15, complexity * complexity * 15),
    concepts: [],
    steps: stepsFor(effectiveType, complexity),
    summary: input.trim().slice(0, 280),
  };
}
