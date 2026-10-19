import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { EmptyState, ProgressBar, ScreenTitle, SectionHeader, Segmented, Surface, Tag, Tap } from "@/components/uni-flow";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { dueHint, formatShortDate, formatTime, kindLabel, priorityLabel, priorityTone } from "@/lib/academic-utils";

function mondayOf(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export default function TasksScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const [view, setView] = useState<"list" | "week">("list");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const tasks = trpc.task.list.useQuery();
  const completed = trpc.task.completed.useQuery();
  const planner = trpc.planner.snapshot.useQuery();
  const week = trpc.planner.week.useQuery({ weekStart }, { enabled: view === "week" });
  const refresh = () => Promise.all([utils.task.invalidate(), utils.planner.invalidate()]);
  const complete = trpc.task.complete.useMutation({ onSuccess: refresh });
  const replan = trpc.planner.replan.useMutation({ onSuccess: refresh });
  const completeSession = trpc.planner.completeSession.useMutation({ onSuccess: refresh });

  const { overdue, upcoming } = useMemo(() => {
    const all = tasks.data ?? [];
    return { overdue: all.filter((task) => task.status === "overdue"), upcoming: all.filter((task) => task.status !== "overdue") };
  }, [tasks.data]);

  const shiftWeek = (days: number) => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() + days); return next; });
  const isToday = (date: Date) => new Date(date).toDateString() === new Date().toDateString();

  const renderTask = (task: NonNullable<typeof tasks.data>[number]) => (
    <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)}>
      <Surface className="mb-3 flex-row overflow-hidden">
        <View className={`w-1.5 ${task.status === "overdue" ? "bg-error" : task.priority === "critical" || task.priority === "high" ? "bg-warning" : "bg-primary"}`} />
        <View className="flex-1 p-4">
          <View className="flex-row items-start justify-between"><Text className="flex-1 pr-2 text-base font-semibold text-foreground">{task.title}</Text><Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} /></View>
          <Text className="mt-2 text-sm text-muted">{kindLabel(task.kind)} · {dueHint(task.dueAt)} · {formatShortDate(task.dueAt)} · {task.estimatedMinutes} min</Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs text-muted">Complejidad {task.complexity}/5</Text>
            <Tap hitSlop={6} onPress={() => complete.mutate({ taskId: task.id })} className="rounded-xl bg-[#E1EEE5] px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-primary">Ya está hecho</Text></Tap>
          </View>
        </View>
      </Surface>
    </Pressable>
  );

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
        <ScreenTitle eyebrow="Tu semestre en movimiento" title="Tareas" subtitle="La prioridad se calcula por complejidad, urgencia y carga acumulada." />

        <Surface className="mb-5 p-5">
          <View className="flex-row items-end justify-between">
            <View><Text className="text-sm font-semibold text-primary">Carga sugerida hoy</Text><Text className="mt-1 text-3xl font-bold text-foreground">{planner.data?.recommendedMinutes ?? "—"} min</Text></View>
            <Text className="text-sm text-muted">{planner.data?.totalActive ?? 0} activas</Text>
          </View>
          <ProgressBar value={Math.min(100, ((planner.data?.recommendedMinutes ?? 0) / 90) * 100)} className="mt-4" />
          <Text className="mt-3 text-sm leading-5 text-muted">{planner.data?.nextAction ?? "Añade tu primera tarea para calcular el plan."}</Text>
          <View className="mt-4 flex-row gap-2">
            <Tap onPress={() => router.push("/task/new")} className="rounded-xl bg-primary px-3 py-2 active:opacity-80"><Text className="text-xs font-bold text-background">+ Nueva tarea</Text></Tap>
            <Tap onPress={() => replan.mutate()} className="rounded-xl bg-background px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-primary">{replan.isPending ? "Recalculando…" : "Recalcular plan"}</Text></Tap>
          </View>
        </Surface>

        <Segmented value={view} onChange={setView} options={[{ value: "list", label: "Pendientes" }, { value: "week", label: "Semana" }]} />
        <View className="h-5" />

        {view === "list" ? (
          <>
            {tasks.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {overdue.length ? <><SectionHeader title="Vencidas · revisar" />{overdue.map(renderTask)}</> : null}
            <SectionHeader title="Pendientes" />
            {!tasks.isLoading && !upcoming.length ? <EmptyState title="No hay pendientes" detail="Desde Capturar puedes añadir una entrega, un examen o un paso pequeño." /> : null}
            {upcoming.map(renderTask)}
            <SectionHeader title="Completadas recientemente" className="mt-4" />
            {completed.data?.slice(0, 5).map((task) => (
              <Tap key={task.id} onPress={() => router.push(`/task/${task.id}`)} className="mb-3 flex-row items-center rounded-2xl border border-border bg-background px-4 py-3">
                <View className="mr-3 h-6 w-6 items-center justify-center rounded-full bg-primary"><Text className="text-xs font-bold text-background">✓</Text></View>
                <Text className="flex-1 text-sm text-muted line-through">{task.title}</Text>
              </Tap>
            ))}
          </>
        ) : (
          <>
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable hitSlop={10} onPress={() => shiftWeek(-7)}><Text className="text-sm font-semibold text-primary">← Anterior</Text></Pressable>
              <Text className="text-sm font-semibold text-foreground">Semana del {formatShortDate(weekStart)}</Text>
              <Pressable hitSlop={10} onPress={() => shiftWeek(7)}><Text className="text-sm font-semibold text-primary">Siguiente →</Text></Pressable>
            </View>
            {week.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {week.data?.map((day) => (
              <Surface key={String(day.date)} className={`mb-3 p-4 ${isToday(day.date) ? "border-primary" : ""}`}>
                <Text className="text-sm font-bold capitalize text-foreground">{new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short" }).format(new Date(day.date))}</Text>
                {!day.tasks.length && !day.sessions.length ? <Text className="mt-1 text-xs text-muted">Libre</Text> : null}
                {day.tasks.map((task) => (
                  <Tap key={`t${task.id}`} onPress={() => router.push(`/task/${task.id}`)} className="mt-2 flex-row items-center rounded-xl bg-[#F6EBD4] px-3 py-2">
                    <Text className="flex-1 text-xs font-semibold text-[#9A6B28]" numberOfLines={1}>{kindLabel(task.kind)}: {task.title}</Text>
                    <Text className="text-xs text-[#9A6B28]">{task.status === "completed" ? "✓" : formatTime(task.dueAt)}</Text>
                  </Tap>
                ))}
                {day.sessions.map((session) => (
                  <View key={`s${session.id}`} className="mt-2 flex-row items-center rounded-xl bg-background px-3 py-2">
                    <Text className={`flex-1 text-xs ${session.status === "completed" ? "text-muted line-through" : "text-foreground"}`} numberOfLines={1}>{formatTime(session.scheduledFor)} · {session.durationMinutes} min · {session.title}</Text>
                    {session.status === "planned" ? <Pressable hitSlop={8} onPress={() => completeSession.mutate({ sessionId: session.id })}><Text className="text-xs font-bold text-primary">Hecha</Text></Pressable> : null}
                  </View>
                ))}
              </Surface>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
