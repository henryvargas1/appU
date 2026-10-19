import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { EmptyState, ProgressBar, SectionHeader, Surface, Tag } from "@/components/uni-flow";
import { trpc } from "@/lib/trpc";
import { dueHint, formatShortDate, priorityLabel, priorityTone } from "@/lib/academic-utils";

export default function TasksScreen() {
  const utils = trpc.useUtils();
  const tasks = trpc.task.list.useQuery();
  const completed = trpc.task.completed.useQuery();
  const complete = trpc.task.complete.useMutation({ onSuccess: () => { void utils.task.list.invalidate(); void utils.planner.snapshot.invalidate(); void utils.planner.reminders.invalidate(); void utils.task.completed.invalidate(); } });
  const planner = trpc.planner.snapshot.useQuery();

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Tu semestre en movimiento</Text>
        <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Tareas</Text>
        <Text className="mt-2 text-base leading-6 text-muted">La prioridad se calcula por complejidad, urgencia y carga acumulada.</Text>

        <Surface className="mt-6 mb-7 p-5"><View className="flex-row items-end justify-between"><View><Text className="text-sm font-semibold text-primary">Carga sugerida hoy</Text><Text className="mt-1 text-3xl font-bold text-foreground">{planner.data?.recommendedMinutes ?? "—"} min</Text></View><Text className="text-sm text-muted">{planner.data?.totalActive ?? 0} activas</Text></View><ProgressBar value={Math.min(100, ((planner.data?.recommendedMinutes ?? 0) / 90) * 100)} className="mt-4" /><Text className="mt-3 text-sm leading-5 text-muted">{planner.data?.nextAction ?? "Añade tu primera tarea para calcular el plan."}</Text></Surface>

        <SectionHeader title="Pendientes" />
        {tasks.isLoading ? <ActivityIndicator color="#486B5A" /> : null}
        {!tasks.isLoading && !tasks.data?.length ? <EmptyState title="No hay pendientes" detail="Desde Capturar puedes añadir una entrega, un examen o un paso pequeño." /> : null}
        {tasks.data?.map((task) => (
          <Surface key={task.id} className="mb-3 p-4">
            <View className="flex-row items-start"><View className="mr-3 mt-1 h-3 w-3 rounded-full bg-primary" /><View className="flex-1"><View className="flex-row items-start justify-between"><Text className="flex-1 pr-2 text-base font-semibold text-foreground">{task.title}</Text><Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} /></View><Text className="mt-2 text-sm text-muted">{dueHint(task.dueAt)} · {formatShortDate(task.dueAt)} · {task.estimatedMinutes} min</Text><View className="mt-3 flex-row items-center justify-between"><Text className="text-xs text-muted">Complejidad {task.complexity}/5</Text><Pressable onPress={() => complete.mutate({ taskId: task.id })} className="rounded-xl bg-[#E1EEE5] px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-primary">Ya está hecho</Text></Pressable></View></View></View>
          </Surface>
        ))}

        <SectionHeader title="Completadas recientemente" />
        {completed.data?.slice(0, 3).map((task) => <View key={task.id} className="mb-3 flex-row items-center rounded-2xl border border-border bg-background px-4 py-3"><View className="mr-3 h-6 w-6 items-center justify-center rounded-full bg-primary"><Text className="text-xs font-bold text-background">✓</Text></View><Text className="flex-1 text-sm text-muted line-through">{task.title}</Text></View>)}
      </ScrollView>
    </ScreenContainer>
  );
}
