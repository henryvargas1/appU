import { ENV } from "./_core/env";
import { invokeLLM, type Message } from "./_core/llm";
import { transcribeAudio as transcribeWithService } from "./_core/voiceTranscription";
import { normalize, parseSpanishDate, suggestFromText, type CaptureSuggestion, type CaptureType } from "../shared/capture-parser";

export function isAiAvailable() {
  return Boolean(ENV.forgeApiKey);
}

function messageText(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join("").trim();
  return "";
}

async function complete(messages: Message[], schema?: { name: string; schema: Record<string, unknown> }) {
  const result = await invokeLLM({ messages, ...(schema ? { outputSchema: { ...schema, strict: true } } : {}) });
  return messageText(result.choices[0]?.message?.content);
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Clasificación de capturas
// ---------------------------------------------------------------------------

const SUGGESTION_SCHEMA = {
  name: "capture_suggestion",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["type", "title", "dueAt", "subjectId", "priority", "complexity", "estimatedMinutes", "concepts", "steps", "summary"],
    properties: {
      type: { type: "string", enum: ["task", "exam", "delivery", "reminder", "note"] },
      title: { type: "string" },
      dueAt: { type: ["string", "null"], description: "Fecha ISO 8601 con hora local, o null si no se menciona" },
      subjectId: { type: ["integer", "null"] },
      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
      complexity: { type: "integer", minimum: 1, maximum: 5 },
      estimatedMinutes: { type: "integer", minimum: 15, maximum: 600 },
      concepts: { type: "array", items: { type: "string" } },
      steps: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
};

/**
 * Propone una clasificación para una captura. Nunca crea tareas: el resultado
 * queda en la bandeja para que el usuario lo revise y corrija.
 */
export async function analyzeCapture(input: {
  text: string;
  kind: "text" | "photo" | "audio" | "document";
  subjects: Array<{ id: number; name: string }>;
  now: Date;
}): Promise<CaptureSuggestion> {
  const heuristic = suggestFromText(input.text, { now: input.now, subjects: input.subjects });
  if (!isAiAvailable() || !input.text.trim()) return heuristic;

  try {
    const raw = await complete(
      [
        {
          role: "system",
          content:
            "Eres el clasificador de UniFlow, un asistente académico. Analiza capturas de clase en español y propone una clasificación. " +
            "No inventes fechas: si no hay fecha explícita o relativa, usa null. Usa solo subjectId de la lista dada o null. " +
            "Los pasos solo aplican a trabajos largos o exámenes (máximo 6). Responde solo con el JSON pedido.",
        },
        {
          role: "user",
          content: [
            `Fecha y hora actual: ${input.now.toString()}`,
            `Tipo de captura: ${input.kind}`,
            `Materias: ${input.subjects.map((subject) => `${subject.id}=${subject.name}`).join(", ") || "ninguna"}`,
            `Sugerencia heurística previa: ${JSON.stringify(heuristic)}`,
            "Contenido:",
            input.text.slice(0, 12_000),
          ].join("\n"),
        },
      ],
      SUGGESTION_SCHEMA,
    );
    const parsed = parseJson<Omit<CaptureSuggestion, "subjectName" | "dueAt"> & { dueAt: string | null }>(raw);
    if (!parsed) return heuristic;
    const dueAt = parsed.dueAt ? new Date(parsed.dueAt) : null;
    const subject = input.subjects.find((item) => item.id === parsed.subjectId) ?? null;
    return {
      type: (["task", "exam", "delivery", "reminder", "note"] as CaptureType[]).includes(parsed.type) ? parsed.type : heuristic.type,
      title: parsed.title?.trim().slice(0, 240) || heuristic.title,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : heuristic.dueAt,
      subjectId: subject?.id ?? heuristic.subjectId,
      subjectName: subject?.name ?? heuristic.subjectName,
      priority: parsed.priority ?? heuristic.priority,
      complexity: Math.min(5, Math.max(1, Math.round(parsed.complexity || heuristic.complexity))),
      estimatedMinutes: Math.min(600, Math.max(15, Math.round(parsed.estimatedMinutes || heuristic.estimatedMinutes))),
      concepts: (parsed.concepts ?? []).slice(0, 12),
      steps: (parsed.steps ?? []).slice(0, 6),
      summary: parsed.summary?.trim() || heuristic.summary,
    };
  } catch (error) {
    console.warn("[AI] analyzeCapture fallback", error instanceof Error ? error.message : "unknown");
    return heuristic;
  }
}

// ---------------------------------------------------------------------------
// Extracción de archivos y transcripción
// ---------------------------------------------------------------------------

export async function extractAssetText(input: { url: string; mimeType: string; kind: "photo" | "document" }) {
  if (!isAiAvailable()) {
    return "El archivo quedó guardado. Cuando el servicio de IA esté disponible, UniFlow extraerá su contenido aquí.";
  }
  try {
    const instruction = input.kind === "photo"
      ? "Extrae todo el texto legible de esta foto de clase (tablero, cuaderno o diapositiva). Conserva fechas, nombres de temas, tareas y fórmulas. Devuelve solo el texto."
      : "Extrae y organiza el texto de este documento académico. Conserva fechas, tareas y conceptos. Devuelve solo el texto.";
    const mime = input.mimeType as "application/pdf";
    const text = await complete([
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          input.kind === "photo"
            ? { type: "image_url", image_url: { url: input.url, detail: "high" } }
            : { type: "file_url", file_url: { url: input.url, mime_type: mime } },
        ],
      },
    ]);
    return text || "No encontré texto legible en el archivo.";
  } catch (error) {
    console.warn("[AI] extractAssetText failed", error instanceof Error ? error.message : "unknown");
    return "El archivo se guardó, pero el procesamiento no respondió. Puedes intentarlo de nuevo.";
  }
}

export type TranscriptionResult = {
  ok: boolean;
  text: string;
  language: string;
  durationSeconds: number | null;
  segments: Array<{ start: number; end: number; text: string }>;
};

export async function transcribeAudio(input: { audioUrl: string }): Promise<TranscriptionResult> {
  if (!isAiAvailable() || !ENV.forgeApiUrl) {
    return { ok: false, text: "El audio quedó guardado. La transcripción estará disponible cuando el servicio de voz esté habilitado.", language: "es", durationSeconds: null, segments: [] };
  }
  const result = await transcribeWithService({
    audioUrl: input.audioUrl,
    language: "es",
    prompt: "Transcribe este audio de una clase universitaria en español latinoamericano. Conserva fechas, tareas y conceptos.",
  });
  if ("error" in result) {
    console.warn("[AI] transcription failed", result.code);
    return { ok: false, text: "No pude transcribir el audio todavía. Puedes conservarlo y reintentarlo más tarde.", language: "es", durationSeconds: null, segments: [] };
  }
  return {
    ok: true,
    text: result.text.trim() || "No encontré voz clara en el audio.",
    language: result.language || "es",
    durationSeconds: result.duration ? Math.round(result.duration) : null,
    segments: (result.segments ?? []).map((segment) => ({ start: segment.start, end: segment.end, text: segment.text.trim() })),
  };
}

// ---------------------------------------------------------------------------
// Resúmenes y pasos
// ---------------------------------------------------------------------------

function splitSentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter((item) => item.length > 12);
}

export function fallbackSummary(content: string) {
  const sentences = splitSentences(content);
  if (!sentences.length) return content.trim().slice(0, 280);
  return sentences.slice(0, 3).map((sentence) => `• ${sentence}`).join("\n");
}

export async function summarizeNote(input: { title: string; content: string }) {
  if (!isAiAvailable()) return fallbackSummary(input.content);
  try {
    const text = await complete([
      { role: "system", content: "Resume apuntes universitarios en español en 3 a 6 viñetas breves. Conserva fechas, definiciones y lo que el profesor marcó como importante. No inventes." },
      { role: "user", content: `${input.title}\n\n${input.content.slice(0, 12_000)}` },
    ]);
    return text || fallbackSummary(input.content);
  } catch {
    return fallbackSummary(input.content);
  }
}

export async function generateSteps(input: { title: string; description?: string | null; kind: string; complexity: number }) {
  const fallback = suggestFromText(`${input.kind === "exam" ? "examen" : input.kind === "delivery" ? "entrega" : "tarea"} ${input.title} complejidad ${Math.max(3, input.complexity)}`, { now: new Date() }).steps;
  if (!isAiAvailable()) return fallback;
  try {
    const raw = await complete(
      [
        { role: "system", content: "Divide trabajos académicos en 3 a 6 pasos concretos y progresivos, en español, cada uno de máximo 80 caracteres." },
        { role: "user", content: `Tipo: ${input.kind}. Complejidad ${input.complexity}/5. Título: ${input.title}. ${input.description ?? ""}` },
      ],
      { name: "task_steps", schema: { type: "object", additionalProperties: false, required: ["steps"], properties: { steps: { type: "array", items: { type: "string" } } } } },
    );
    const steps = parseJson<{ steps: string[] }>(raw)?.steps?.map((step) => step.trim()).filter(Boolean).slice(0, 6);
    return steps?.length ? steps : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Chat académico
// ---------------------------------------------------------------------------

export type ChatContextTask = { id: number; title: string; dueAt: Date | null; complexity: number; priority: string; status: string; kind: string; subjectName: string | null };
export type ChatContextNote = { id: number; title: string; content: string; subjectName: string | null; createdAt: Date };

export type ChatAction =
  | { type: "create_task"; title: string; dueAt: string | null; kind: "task" | "exam" | "delivery"; priority: "low" | "medium" | "high" | "critical"; complexity: number; subjectId: number | null }
  | { type: "change_due_date"; taskId: number; dueAt: string }
  | { type: "summarize_note"; noteId: number }
  | { type: "generate_plan" };

export type ChatReply = { answer: string; actions: ChatAction[] };

const CHAT_SCHEMA = {
  name: "chat_reply",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "actions"],
    properties: {
      answer: { type: "string" },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "title", "dueAt", "kind", "priority", "complexity", "subjectId", "taskId", "noteId"],
          properties: {
            type: { type: "string", enum: ["create_task", "change_due_date", "summarize_note", "generate_plan"] },
            title: { type: ["string", "null"] },
            dueAt: { type: ["string", "null"] },
            kind: { type: ["string", "null"], enum: ["task", "exam", "delivery", null] },
            priority: { type: ["string", "null"], enum: ["low", "medium", "high", "critical", null] },
            complexity: { type: ["integer", "null"] },
            subjectId: { type: ["integer", "null"] },
            taskId: { type: ["integer", "null"] },
            noteId: { type: ["integer", "null"] },
          },
        },
      },
    },
  },
};

type RawAction = { type: string; title: string | null; dueAt: string | null; kind: string | null; priority: string | null; complexity: number | null; subjectId: number | null; taskId: number | null; noteId: number | null };

function sanitizeActions(raw: RawAction[], context: { tasks: ChatContextTask[]; notes: ChatContextNote[]; subjects: Array<{ id: number }> }): ChatAction[] {
  const actions: ChatAction[] = [];
  for (const item of raw.slice(0, 4)) {
    if (item.type === "create_task" && item.title) {
      actions.push({
        type: "create_task",
        title: item.title.slice(0, 240),
        dueAt: item.dueAt && !Number.isNaN(new Date(item.dueAt).getTime()) ? new Date(item.dueAt).toISOString() : null,
        kind: item.kind === "exam" || item.kind === "delivery" ? item.kind : "task",
        priority: (["low", "medium", "high", "critical"] as const).find((value) => value === item.priority) ?? "medium",
        complexity: Math.min(5, Math.max(1, item.complexity ?? 2)),
        subjectId: context.subjects.some((subject) => subject.id === item.subjectId) ? item.subjectId : null,
      });
    } else if (item.type === "change_due_date" && item.taskId && item.dueAt && context.tasks.some((task) => task.id === item.taskId) && !Number.isNaN(new Date(item.dueAt).getTime())) {
      actions.push({ type: "change_due_date", taskId: item.taskId, dueAt: new Date(item.dueAt).toISOString() });
    } else if (item.type === "summarize_note" && item.noteId && context.notes.some((note) => note.id === item.noteId)) {
      actions.push({ type: "summarize_note", noteId: item.noteId });
    } else if (item.type === "generate_plan") {
      actions.push({ type: "generate_plan" });
    }
  }
  return actions;
}

export async function askAcademicAssistant(input: {
  message: string;
  now: Date;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tasks: ChatContextTask[];
  notes: ChatContextNote[];
  subjects: Array<{ id: number; name: string }>;
  planSummary: string;
}): Promise<ChatReply> {
  if (!isAiAvailable()) return fallbackReply(input);

  const context = [
    `Fecha actual: ${input.now.toString()}`,
    "Materias:",
    ...input.subjects.map((subject) => `- [${subject.id}] ${subject.name}`),
    "Tareas activas:",
    ...input.tasks.map((task) => `- [${task.id}] ${task.title} | tipo: ${task.kind} | materia: ${task.subjectName ?? "—"} | fecha: ${task.dueAt?.toISOString() ?? "sin fecha"} | complejidad ${task.complexity}/5 | prioridad ${task.priority} | estado ${task.status}`),
    "Notas relevantes:",
    ...input.notes.map((note) => `- [${note.id}] ${note.title} (${note.subjectName ?? "sin materia"}, ${note.createdAt.toISOString().slice(0, 10)}): ${note.content.slice(0, 900)}`),
    "Plan de estudio calculado:",
    input.planSummary,
  ].join("\n");

  try {
    const raw = await complete(
      [
        {
          role: "system",
          content:
            "Eres UniFlow, un asistente académico práctico. Responde en español latinoamericano, breve y concreto. " +
            "Básate primero en los datos guardados del estudiante; si algo no está en sus datos, dilo y luego ofrece conocimiento general. No inventes fechas. " +
            "Si el estudiante pide crear una tarea o cambiar una fecha, añade la acción correspondiente: el estudiante la confirmará antes de aplicarla. " +
            "Usa summarize_note para resumir una nota existente y generate_plan para mostrar el plan de estudio. " +
            "Si pide preguntas de repaso, formula 3 a 5 preguntas de recuerdo activo basadas en sus notas.",
        },
        { role: "system", content: context },
        ...input.history.slice(-10).map((item) => ({ role: item.role, content: item.content }) as Message),
        { role: "user", content: input.message },
      ],
      CHAT_SCHEMA,
    );
    const parsed = parseJson<{ answer: string; actions: RawAction[] }>(raw);
    if (!parsed?.answer) return raw ? { answer: raw, actions: [] } : fallbackReply(input);
    return { answer: parsed.answer.trim(), actions: sanitizeActions(parsed.actions ?? [], input) };
  } catch (error) {
    console.warn("[AI] chat fallback", error instanceof Error ? error.message : "unknown");
    return fallbackReply(input);
  }
}

const STOPWORDS = new Set(["que", "dijo", "profesor", "profesora", "sobre", "hazme", "preguntas", "pregunta", "del", "de", "la", "el", "los", "las", "un", "una", "para", "por", "con", "mis", "mi", "tengo", "esta", "este", "como", "cual", "cuando", "donde", "repaso", "repasar", "resume", "resumen", "nota", "notas"]);

export function keywords(text: string) {
  return normalize(text).split(/[^a-z0-9ñ]+/).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function relevantNotes(message: string, notes: ChatContextNote[]) {
  const words = keywords(message);
  if (!words.length) return [];
  return notes
    .map((note) => {
      const haystack = normalize(`${note.title} ${note.subjectName ?? ""} ${note.content}`);
      return { note, hits: words.filter((word) => haystack.includes(word)).length };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((item) => item.note);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function fallbackReply(input: {
  message: string;
  now: Date;
  tasks: ChatContextTask[];
  notes: ChatContextNote[];
  subjects: Array<{ id: number; name: string }>;
  planSummary: string;
}): ChatReply {
  const text = normalize(input.message);

  if (/\b(crea|crear|agrega|anade|agendar|agenda|recuerdame|anota)\b/.test(text)) {
    const cleaned = input.message.replace(/^(por favor\s*)?(crea|crear|agrega|añade|anade|agenda|agendar|recuérdame|recuerdame|anota)(\s+(una|un|la|el))?(\s+tarea)?\s*(de|para|que)?\s*:?\s*/i, "");
    const suggestion = suggestFromText(cleaned || input.message, { now: input.now, subjects: input.subjects });
    const kind = suggestion.type === "exam" || suggestion.type === "delivery" ? suggestion.type : "task";
    return {
      answer: `Preparé esta tarea para que la revises: “${suggestion.title}”${suggestion.dueAt ? `, para el ${formatDate(suggestion.dueAt)}` : ", sin fecha"}. Confírmala si está bien.`,
      actions: [{ type: "create_task", title: suggestion.title, dueAt: suggestion.dueAt?.toISOString() ?? null, kind, priority: suggestion.priority, complexity: suggestion.complexity, subjectId: suggestion.subjectId }],
    };
  }

  if (/\b(cambia|cambiar|mueve|mover|pasa|aplaza|reprograma)\b/.test(text)) {
    const dueAt = parseSpanishDate(input.message, input.now);
    const words = keywords(input.message);
    const task = input.tasks
      .map((item) => ({ item, hits: words.filter((word) => normalize(item.title).includes(word)).length }))
      .sort((a, b) => b.hits - a.hits)[0];
    if (dueAt && task?.hits) {
      return {
        answer: `Puedo mover “${task.item.title}” al ${formatDate(dueAt)}. Confirma el cambio y recalcularé los recordatorios.`,
        actions: [{ type: "change_due_date", taskId: task.item.id, dueAt: dueAt.toISOString() }],
      };
    }
    return { answer: "Dime qué tarea quieres mover y la nueva fecha, por ejemplo: “mueve el ensayo de historia al viernes”.", actions: [] };
  }

  if (/\b(plan|organiza|organizar|priorizar|prioriza)\b/.test(text)) {
    return { answer: "Este es tu plan según complejidad, urgencia y carga acumulada:", actions: [{ type: "generate_plan" }] };
  }

  if (/\b(resume|resumir|resumen)\b/.test(text)) {
    const note = relevantNotes(input.message, input.notes)[0] ?? input.notes[0];
    if (!note) return { answer: "Aún no tienes notas guardadas para resumir. Captura una desde la pestaña Capturar.", actions: [] };
    return { answer: `Resumen de “${note.title}”:`, actions: [{ type: "summarize_note", noteId: note.id }] };
  }

  if (/\b(preguntas?|repaso|repasar|quiz|evaluame)\b/.test(text)) {
    const notes = relevantNotes(input.message, input.notes);
    const source = notes[0];
    if (!source) {
      const topic = keywords(input.message).join(" ") || "el tema";
      return { answer: `No encontré notas guardadas sobre ${topic}. Te propongo estas preguntas generales:\n1. ¿Cuál es la definición de ${topic}?\n2. ¿Qué ejemplo puedes resolver paso a paso?\n3. ¿Qué errores son comunes al aplicarlo?`, actions: [] };
    }
    const questions = splitSentences(source.content).slice(0, 4).map((sentence, index) => `${index + 1}. Explica con tus palabras: “${sentence.slice(0, 120)}”`);
    return { answer: `Preguntas de repaso a partir de “${source.title}”:\n${questions.join("\n") || "1. ¿Cuál es la idea principal de esta nota?"}`, actions: [] };
  }

  if (/\b(dijo|menciono|explico|profesor|profesora)\b/.test(text)) {
    const notes = relevantNotes(input.message, input.notes).slice(0, 2);
    if (!notes.length) return { answer: "No encontré eso en tus notas guardadas. Si lo grabaste o fotografiaste, captúralo y lo buscaré.", actions: [] };
    return { answer: notes.map((note) => `En “${note.title}” (${note.createdAt.toLocaleDateString("es-CO")}): ${note.content.slice(0, 300)}`).join("\n\n"), actions: [] };
  }

  if (/\b(semana|pendiente|pendientes|que tengo|proximo|proxima|hoy|manana)\b/.test(text)) {
    const limit = new Date(input.now.getTime() + 7 * 86_400_000);
    const week = input.tasks.filter((task) => task.dueAt && task.dueAt <= limit).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
    if (!input.tasks.length) return { answer: "No tienes tareas pendientes registradas. Puedes capturar una desde la pestaña Capturar.", actions: [] };
    if (!week.length) return { answer: `No tienes entregas en los próximos 7 días. Tienes ${input.tasks.length} tarea(s) activa(s); la más importante es “${input.tasks[0].title}”.`, actions: [] };
    return {
      answer: `Esta semana tienes:\n${week.map((task) => `• ${task.title} — ${formatDate(task.dueAt!)}${task.subjectName ? ` (${task.subjectName})` : ""}`).join("\n")}\n\n${input.planSummary}`,
      actions: [],
    };
  }

  return {
    answer: "Puedo revisar tus tareas, buscar en tus notas, hacerte preguntas de repaso, crear tareas o cambiar fechas. Prueba con: “¿qué tengo esta semana?” o “crea una tarea: taller de cálculo el viernes”.",
    actions: [],
  };
}
