export function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

export function formatLongDate(value: Date | string | null | undefined) {
  if (!value) return "Sin fecha definida";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function priorityLabel(priority: string) {
  return ({ low: "Baja", medium: "Media", high: "Alta", critical: "Urgente" } as Record<string, string>)[priority] ?? priority;
}

export function priorityTone(priority: string) {
  if (priority === "critical" || priority === "high") return "rose" as const;
  if (priority === "medium") return "amber" as const;
  return "sage" as const;
}

export function dueHint(value: Date | string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = value instanceof Date ? value : new Date(value);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Vencida";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}
