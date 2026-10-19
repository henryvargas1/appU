import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, BackHeader, ButtonLabel, ErrorText, Field, ProgressBar, SectionHeader, Surface, Tag, Tap } from "@/components/uni-flow";
import { TaskForm } from "@/components/task-form";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { dueHint, formatDateTime, formatLongDate, kindLabel, priorityLabel, priorityTone, stageLabel } from "@/lib/academic-utils";

const sessionStatus: Record<string, string> = { planned: "Planificada", completed: "Completada", skipped: "Omitida", rescheduled: "Reprogramada" };
const reminderStatus: Record<string, string> = { scheduled: "Programado", sent: "Enviado", done: "Hecho", snoozed: "Pospuesto", dismissed: "Cancelado", expired: "Detenido" };

function confirmAction(message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert("UniFlow", message, [{ text: "Cancelar", style: "cancel" }, { text: "Sí", style: "destructive", onPress: onConfirm }]);
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const detail = trpc.task.get.useQuery({ taskId }, { enabled: Number.isFinite(taskId) });
  const subjects = trpc.subject.list.useQuery();
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState("");
  const refresh = () => Promise.all([utils.task.invalidate(), utils.planner.invalidate()]);
  const update = trpc.task.update.useMutation({ onSuccess: async () => { await refresh(); setEditing(false); } });
  const complete = trpc.task.complete.useMutation({ onSuccess: refresh });
  const reopen = trpc.task.reopen.useMutation({ onSuccess: refresh });
  const remove = trpc.task.delete.useMutation({ onSuccess: async () => { await refresh(); router.back(); } });
  const toggleStep = trpc.task.toggleStep.useMutation({ onSuccess: refresh });
  const addStep = trpc.task.addStep.useMutation({ onSuccess: async () => { setNewStep(""); await refresh(); } });
  const generate = trpc.task.generateSteps.useMutation({ onSuccess: refresh });
  const completeSession = trpc.planner.completeSession.useMutation({ onSuccess: refresh });
  const reschedule = trpc.planner.rescheduleSession.useMutation({ onSuccess: refresh });

  const data = detail.data;
  const task = data?.task;
  const stepsDone = data?.steps.filter((step) => step.status === "completed").length ?? 0;
  const sessionsDone = data?.sessions.filter((session) => session.status === "completed").reduce((sum, session) => sum + session.durationMinutes, 0) ?? 0;
  const error = update.error || complete.error || reopen.error || remove.error || toggleStep.error || addStep.error || generate.error || completeSession.error || reschedule.error;

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title={task ? kindLabel(task.kind) : "Tarea"} right={task && !editing ? <Pressable hitSlop={10} onPress={() => setEditing(true)}><Text className="font-semibold text-primary">Editar</Text></Pressable> : null} />
      {detail.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      <ErrorText error={detail.error} />
      {task && data ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
          {editing ? (
            <>
              <TaskForm
                initial={{ type: task.kind, title: task.title, content: task.description ?? "", subjectId: task.subjectId, dueAt: task.dueAt, priority: task.priority, complexity: task.complexity, estimatedMinutes: task.estimatedMinutes }}
                allowNote={false}
                showSteps={false}
                subjects={subjects.data ?? []}
                submitLabel="Guardar cambios"
                pending={update.isPending}
                onSubmit={(values) => update.mutate({
                  taskId,
                  title: values.title,
                  description: values.content || null,
                  kind: values.type === "exam" || values.type === "delivery" ? values.type : "task",
                  subjectId: values.subjectId,
                  dueAt: values.dueAt,
                  priority: values.priority,
                  complexity: values.complexity,
                  estimatedMinutes: values.estimatedMinutes,
                })}
              />
              <ActionButton variant="soft" className="mt-3" onPress={() => setEditing(false)}><ButtonLabel variant="soft">Cancelar</ButtonLabel></ActionButton>
            </>
          ) : (
            <>
              <Text className="text-3xl font-bold tracking-tight text-foreground">{task.title}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} />
                {data.subject ? <Tag label={data.subject.name} tone="sage" /> : null}
                <Tag label={`Complejidad ${task.complexity}/5`} />
                {task.status === "overdue" ? <Tag label="Vencida" tone="rose" /> : null}
                {task.status === "completed" ? <Tag label="Completada" tone="sage" /> : null}
              </View>
              <Text className="mt-4 text-base text-foreground">{task.dueAt ? `${formatLongDate(task.dueAt)} · ${dueHint(task.dueAt)}` : "Sin fecha límite"}</Text>
              {task.description ? <Text className="mt-3 text-sm leading-6 text-muted">{task.description}</Text> : null}
              {task.status === "overdue" ? <Surface className="mt-4 bg-[#F6E2E0] p-4"><Text className="text-sm leading-5 text-[#A6534E]">La fecha pasó sin confirmación y los recordatorios automáticos se detuvieron. Márcala como hecha o cambia la fecha.</Text></Surface> : null}

              <Surface className="mt-5 p-4">
                <Text className="text-sm font-semibold text-primary">Avance</Text>
                <ProgressBar value={task.status === "completed" ? 100 : Math.min(100, (sessionsDone / Math.max(1, task.estimatedMinutes)) * 100)} className="mt-3" />
                <Text className="mt-2 text-xs text-muted">{sessionsDone} de {task.estimatedMinutes} min estimados · {stepsDone}/{data.steps.length} pasos</Text>
              </Surface>

              <View className="mt-5 flex-row gap-2">
                {task.status === "completed"
                  ? <ActionButton variant="soft" className="flex-1" onPress={() => reopen.mutate({ taskId })}><ButtonLabel variant="soft">Reabrir</ButtonLabel></ActionButton>
                  : <ActionButton className="flex-1" disabled={complete.isPending} onPress={() => complete.mutate({ taskId })}><ButtonLabel>Ya está hecho</ButtonLabel></ActionButton>}
                <ActionButton variant="danger" onPress={() => confirmAction("¿Eliminar esta tarea? Se conservará en tu exportación.", () => remove.mutate({ taskId }))}><ButtonLabel variant="danger">Eliminar</ButtonLabel></ActionButton>
              </View>
            </>
          )}
          <ErrorText error={error} />

          <SectionHeader title="Pasos" action={generate.isPending ? "Generando…" : "Sugerir pasos"} onAction={() => generate.mutate({ taskId })} className="mt-6" />
          {!data.steps.length ? <Text className="mb-3 text-sm text-muted">Divide los trabajos largos en pasos pequeños para avanzar sin presión.</Text> : null}
          {data.steps.map((step) => (
            <Tap key={step.id} onPress={() => toggleStep.mutate({ stepId: step.id })} className="mb-2 flex-row items-center rounded-2xl border border-border bg-surface px-4 py-3">
              <View className={`mr-3 h-6 w-6 items-center justify-center rounded-full ${step.status === "completed" ? "bg-primary" : "border border-border bg-background"}`}>{step.status === "completed" ? <Text className="text-xs font-bold text-background">✓</Text> : null}</View>
              <Text className={`flex-1 text-sm ${step.status === "completed" ? "text-muted line-through" : "text-foreground"}`}>{step.title}</Text>
              <Text className="text-xs text-muted">{step.estimatedMinutes} min</Text>
            </Tap>
          ))}
          <View className="mt-1 flex-row gap-2">
            <Field value={newStep} onChangeText={setNewStep} placeholder="Añadir paso" className="flex-1" onSubmitEditing={() => newStep.trim() && addStep.mutate({ taskId, title: newStep.trim() })} />
            <ActionButton onPress={() => newStep.trim() && addStep.mutate({ taskId, title: newStep.trim() })}><ButtonLabel>Añadir</ButtonLabel></ActionButton>
          </View>

          <SectionHeader title="Sesiones de estudio" className="mt-6" />
          {!data.sessions.length ? <Text className="mb-3 text-sm text-muted">Las sesiones se planifican solas según la carga y la fecha límite.</Text> : null}
          {data.sessions.map((session) => (
            <Surface key={session.id} className="mb-2 p-3">
              <View className="flex-row items-center justify-between">
                <Text className={`text-sm font-semibold ${session.status === "planned" ? "text-foreground" : "text-muted"}`}>{formatDateTime(session.scheduledFor)} · {session.durationMinutes} min</Text>
                <Text className="text-xs text-muted">{sessionStatus[session.status]}{session.rescheduledFromId ? " · movida" : ""}</Text>
              </View>
              {session.status === "planned" ? (
                <View className="mt-2 flex-row gap-2">
                  <Tap onPress={() => completeSession.mutate({ sessionId: session.id })} className="rounded-xl bg-[#E1EEE5] px-3 py-2"><Text className="text-xs font-bold text-primary">Hecha</Text></Tap>
                  <Tap onPress={() => reschedule.mutate({ sessionId: session.id })} className="rounded-xl bg-background px-3 py-2"><Text className="text-xs font-bold text-muted">No pude · reprogramar</Text></Tap>
                </View>
              ) : null}
            </Surface>
          ))}
          {reschedule.data?.escalated ? <Text className="mb-2 text-xs font-semibold text-error">Prioridad elevada: el retraso pone en riesgo la entrega.</Text> : null}

          <SectionHeader title="Recordatorios" className="mt-6" />
          {!data.reminders.length ? <Text className="text-sm text-muted">Asigna una fecha límite para crear la secuencia de avisos.</Text> : null}
          {data.reminders.filter((reminder) => reminder.status !== "dismissed").map((reminder) => (
            <View key={reminder.id} className="mb-2 flex-row items-center justify-between rounded-xl bg-surface px-3 py-2">
              <Text className="text-xs text-foreground">{formatDateTime(reminder.scheduledFor)} · {stageLabel(reminder.stage)}</Text>
              <Text className="text-xs text-muted">{reminderStatus[reminder.status]}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
