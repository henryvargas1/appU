import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ActionButton, ButtonLabel, ComplexityPicker, DateField, Field, FieldLabel, PriorityPicker, SubjectPicker, TypePicker } from "@/components/uni-flow";
import { parseDateInput, toDateInput, toTimeInput } from "@/lib/academic-utils";

export type TaskFormType = "task" | "exam" | "delivery" | "reminder" | "note";
export type TaskFormPriority = "low" | "medium" | "high" | "critical";

export type TaskFormValues = {
  type: TaskFormType;
  title: string;
  content: string;
  subjectId: number | null;
  dueAt: Date | null;
  priority: TaskFormPriority;
  complexity: number;
  estimatedMinutes: number;
  steps: string[];
};

export function TaskForm({
  initial,
  subjects,
  submitLabel,
  pending,
  allowNote = true,
  showSteps = true,
  onSubmit,
}: {
  initial: Partial<TaskFormValues>;
  subjects: { id: number; name: string }[];
  submitLabel: string;
  pending?: boolean;
  allowNote?: boolean;
  showSteps?: boolean;
  onSubmit: (values: TaskFormValues) => void;
}) {
  const [type, setType] = useState<TaskFormType>(initial.type ?? "task");
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [subjectId, setSubjectId] = useState<number | null>(initial.subjectId ?? null);
  const [day, setDay] = useState(toDateInput(initial.dueAt));
  const [time, setTime] = useState(initial.dueAt ? toTimeInput(initial.dueAt) : "");
  const [priority, setPriority] = useState<TaskFormPriority>(initial.priority ?? "medium");
  const [complexity, setComplexity] = useState(initial.complexity ?? 2);
  const [minutes, setMinutes] = useState(String(initial.estimatedMinutes ?? 30));
  const [steps, setSteps] = useState((initial.steps ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const isNote = type === "note";

  const submit = () => {
    if (!title.trim()) return setError("Escribe un título.");
    const dueAt = day.trim() ? parseDateInput(day, time) : null;
    if (day.trim() && !dueAt) return setError("La fecha debe tener el formato AAAA-MM-DD (y la hora HH:MM).");
    const estimated = Math.min(600, Math.max(15, Number.parseInt(minutes, 10) || complexity * 15));
    setError(null);
    onSubmit({
      type,
      title: title.trim(),
      content: content.trim(),
      subjectId,
      dueAt: isNote ? null : dueAt,
      priority,
      complexity,
      estimatedMinutes: estimated,
      steps: steps.split("\n").map((step) => step.trim()).filter(Boolean),
    });
  };

  return (
    <View>
      <FieldLabel>Tipo</FieldLabel>
      <TypePicker value={type} onChange={setType} includeNote={allowNote} />

      <FieldLabel>Título</FieldLabel>
      <Field value={title} onChangeText={setTitle} placeholder="Ej. Parcial de cálculo" />

      <FieldLabel>{isNote ? "Contenido" : "Detalle"}</FieldLabel>
      <Field value={content} onChangeText={setContent} multiline textAlignVertical="top" className="min-h-[96px]" placeholder="Opcional" />

      <FieldLabel>Materia</FieldLabel>
      <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />

      {!isNote ? (
        <>
          <FieldLabel>Fecha límite</FieldLabel>
          <DateField day={day} time={time} onChangeDay={setDay} onChangeTime={setTime} />

          <FieldLabel>Prioridad</FieldLabel>
          <PriorityPicker value={priority} onChange={setPriority} />

          <FieldLabel>Complejidad</FieldLabel>
          <ComplexityPicker value={complexity} onChange={(value) => { setComplexity(value); setMinutes(String(value * value * 15)); }} />
          <Text className="mt-2 text-xs leading-5 text-muted">La complejidad define la prioridad, el tiempo diario recomendado y cómo se reparten las sesiones.</Text>

          <FieldLabel>Duración estimada (min)</FieldLabel>
          <Field value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />

          {showSteps ? (
            <>
              <FieldLabel>Pasos (uno por línea)</FieldLabel>
              <Field value={steps} onChangeText={setSteps} multiline textAlignVertical="top" className="min-h-[80px]" placeholder={"Reunir apuntes\nResolver ejercicios"} />
            </>
          ) : null}
        </>
      ) : null}

      {error ? <Text className="mt-3 text-sm text-error">{error}</Text> : null}
      <ActionButton onPress={submit} disabled={pending} className="mt-6">
        {pending ? <ActivityIndicator color="#F7F4EC" /> : <ButtonLabel>{submitLabel}</ButtonLabel>}
      </ActionButton>
    </View>
  );
}

export function InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable hitSlop={8} onPress={onPress}><Text className="text-sm font-semibold text-primary">{label}</Text></Pressable>;
}
