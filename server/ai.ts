import { ENV } from "./_core/env";

export async function askAcademicAssistant(input: {
  message: string;
  tasks: Array<{ title: string; dueAt: Date | null; complexity: number; priority: string; status: string }>;
  notes: Array<{ title: string; content: string }>;
}) {
  const fallback = buildFallbackAnswer(input.message, input.tasks);
  if (!ENV.manusApiUrl || !ENV.manusApiKey) return fallback;

  const context = [
    "Tareas activas:",
    ...input.tasks.map((task) => `- ${task.title} | fecha: ${task.dueAt?.toISOString() ?? "sin fecha"} | complejidad: ${task.complexity}/5 | prioridad: ${task.priority} | estado: ${task.status}`),
    "Notas recientes:",
    ...input.notes.map((note) => `- ${note.title}: ${note.content.slice(0, 600)}`),
  ].join("\n");

  try {
    const response = await fetch(`${ENV.manusApiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.manusApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Eres UniFlow, un asistente académico práctico. Responde en español latinoamericano. Usa primero los datos guardados. No inventes fechas. Sugiere acciones pequeñas y concretas. Si faltan datos, dilo claramente." },
          { role: "user", content: `${context}\n\nPregunta del estudiante: ${input.message}` },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function extractAssetText(input: { url: string; mimeType: string; kind: "photo" | "document" }) {
  if (!ENV.manusApiUrl || !ENV.manusApiKey) {
    return "El archivo quedó guardado. Cuando el servicio de IA esté disponible, UniFlow extraerá su contenido aquí.";
  }
  try {
    const content = input.kind === "photo"
      ? [{ type: "text", text: "Extrae todo el texto legible de esta foto de clase. Conserva fechas, nombres de temas, tareas y fórmulas. Devuelve solo el texto." }, { type: "image_url", image_url: { url: input.url, detail: "auto" } }]
      : [{ type: "text", text: "Extrae y organiza el texto de este documento académico. Conserva fechas, tareas y conceptos. Devuelve solo el texto." }, { type: "file_url", file_url: { url: input.url, mime_type: input.mimeType } }];
    const response = await fetch(`${ENV.manusApiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.manusApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content }] }),
    });
    if (!response.ok) return "No pude leer el archivo todavía. Puedes guardarlo y volver a procesarlo más tarde.";
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content?.trim() || "No encontré texto legible en el archivo.";
  } catch {
    return "El archivo se guardó, pero el procesamiento no respondió. Puedes intentarlo de nuevo.";
  }
}

function buildFallbackAnswer(message: string, tasks: Array<{ title: string; dueAt: Date | null; complexity: number; priority: string; status: string }>) {
  const lower = message.toLowerCase();
  if (lower.includes("esta semana") || lower.includes("pendiente")) {
    if (!tasks.length) return "No tienes tareas pendientes registradas. Puedes capturar una desde la pestaña Capturar.";
    return `Tienes ${tasks.length} tarea${tasks.length === 1 ? "" : "s"} activa${tasks.length === 1 ? "" : "s"}. La prioridad es “${tasks[0].title}”${tasks[0].dueAt ? `, con fecha ${tasks[0].dueAt.toLocaleDateString("es-CO")}` : ""}.`;
  }
  if (lower.includes("pregunta") || lower.includes("repaso")) {
    return "Para repasar mejor, elige una nota o materia y te prepararé preguntas de recuerdo activo, empezando por lo esencial y aumentando la dificultad.";
  }
  return "Puedo ayudarte a revisar tus tareas, priorizar el trabajo o convertir una idea en un plan. Prueba con: “¿qué tengo esta semana?” o “organiza mi tarea más urgente”.";
}


export async function transcribeAudio(input: { bytes: ArrayBuffer; filename: string; mimeType: string }) {
  if (!ENV.manusApiUrl || !ENV.manusApiKey) return "El audio quedó guardado. La transcripción estará disponible cuando el servicio de voz esté habilitado.";
  try {
    const form = new FormData();
    form.append("file", new Blob([input.bytes], { type: input.mimeType }), input.filename);
    form.append("model", "whisper-1");
    form.append("prompt", "Transcribe este audio de una clase universitaria en español latinoamericano. Conserva fechas, tareas y conceptos.");
    const response = await fetch(`${ENV.manusApiUrl.replace(/\/$/, "")}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.manusApiKey}` },
      body: form,
    });
    if (!response.ok) return "No pude transcribir el audio todavía. Puedes conservarlo y reintentarlo más tarde.";
    const body = (await response.json()) as { text?: string };
    return body.text?.trim() || "No encontré voz clara en el audio.";
  } catch {
    return "El audio se guardó, pero la transcripción no respondió. Puedes intentarlo de nuevo.";
  }
}
