import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ProgressBar, SectionHeader, Surface, Tag, Tap } from "@/components/uni-flow";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { dueHint, formatDateTime, formatTime, kindLabel, priorityLabel, priorityTone, stageLabel, weekdayLabel } from "@/lib/academic-utils";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";

const quickCaptures = [
  { mode: "text", label: "Texto", icon: "doc.text" },
  { mode: "photo", label: "Foto", icon: "camera.fill" },
  { mode: "audio", label: "Audio", icon: "mic.fill" },
  { mode: "document", label: "Archivo", icon: "tray.fill" },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const snapshot = trpc.planner.snapshot.useQuery();
  const reminders = trpc.planner.reminders.useQuery();
  const inbox = trpc.inbox.list.useQuery();
  const refresh = () => Promise.all([utils.planner.invalidate(), utils.inbox.list.invalidate()]);
  const completeSession = trpc.planner.completeSession.useMutation({ onSuccess: refresh });
  const reschedule = trpc.planner.rescheduleSession.useMutation({ onSuccess: refresh });
  const reminderDone = trpc.reminder.done.useMutation({ onSuccess: () => Promise.all([refresh(), utils.task.invalidate()]) });
  const snooze = trpc.reminder.snooze.useMutation({ onSuccess: refresh });

  const firstName = user?.name?.split(" ")[0] || "estudiante";
  const data = snapshot.data;
  const progress = data?.progress;
  const pendingSessions = data?.todaySessions.filter((session) => session.status === "planned") ?? [];

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={snapshot.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
        <View className="mb-6 flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">{weekdayLabel()} · tu centro académico</Text>
            <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Hola, {firstName}.</Text>
            <Text className="mt-2 text-base leading-6 text-muted">Hoy solo necesitas avanzar en el siguiente paso.</Text>
          </View>
          <Tap accessibilityLabel="Ajustes" onPress={() => router.push("/settings")} className="h-12 w-12 items-center justify-center rounded-2xl bg-surface active:opacity-70">
            <IconSymbol name="gearshape.fill" size={22} color={colors.primary} />
          </Tap>
        </View>

        <View className="mb-6 flex-row gap-2">
          {quickCaptures.map((item) => (
            <Tap key={item.mode} onPress={() => router.push({ pathname: "/(tabs)/capture", params: { mode: item.mode } })} className="flex-1 items-center rounded-2xl border border-border bg-surface py-3 active:opacity-70">
              <IconSymbol name={item.icon} size={22} color={colors.primary} />
              <Text className="mt-1 text-xs font-semibold text-foreground">{item.label}</Text>
            </Tap>
          ))}
        </View>

        {inbox.data?.length ? (
          <Tap onPress={() => router.push("/(tabs)/capture")} className="mb-6 flex-row items-center rounded-2xl bg-[#F6EBD4] px-4 py-3 active:opacity-80">
            <Text className="flex-1 text-sm font-semibold text-[#9A6B28]">{inbox.data.length} captura{inbox.data.length === 1 ? "" : "s"} por revisar en tu bandeja</Text>
            <Text className="text-sm font-bold text-[#9A6B28]">Revisar →</Text>
          </Tap>
        ) : null}

        <Surface className="mb-6 p-5">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-primary">Plan de hoy</Text>
              <Text className="mt-1 text-2xl font-bold text-foreground">{data ? `${data.recommendedMinutes} min` : "—"}</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">{data?.nextAction ?? "Calculando tu siguiente paso..."}</Text>
            </View>
            <View className="h-14 w-14 items-center justify-center rounded-full border-4 border-[#CFE0D3]"><Text className="text-sm font-bold text-primary">{progress?.percent ?? 0}%</Text></View>
          </View>
          <ProgressBar value={progress?.percent ?? 0} className="mt-5" />
          <Text className="mt-2 text-xs text-muted">Semana: {progress?.tasksDone ?? 0}/{progress?.tasksTotal ?? 0} entregas · {progress?.minutesDone ?? 0}/{progress?.minutesPlanned ?? 0} min de estudio</Text>
          {pendingSessions.map((session) => (
            <View key={session.id} className="mt-4 rounded-2xl bg-background p-3">
              <Text className="text-sm font-semibold text-foreground">{formatTime(session.scheduledFor)} · {session.durationMinutes} min</Text>
              <Text className="mt-1 text-sm text-muted" numberOfLines={1}>{session.title}</Text>
              <View className="mt-3 flex-row gap-2">
                <Tap onPress={() => completeSession.mutate({ sessionId: session.id })} className="rounded-xl bg-[#E1EEE5] px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-primary">Hecha</Text></Tap>
                <Tap onPress={() => reschedule.mutate({ sessionId: session.id })} className="rounded-xl bg-surface px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-muted">Mover a mañana</Text></Tap>
              </View>
            </View>
          ))}
          {reschedule.data?.escalated ? <Text className="mt-3 text-xs font-semibold text-error">Subimos la prioridad: el retraso pone en riesgo la entrega.</Text> : null}
        </Surface>

        <SectionHeader title="Prioridad ahora" action="Ver todo" onAction={() => router.push("/(tabs)/tasks")} />
        {snapshot.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {snapshot.error ? <Text className="mb-4 text-sm text-error">{snapshot.error.message}</Text> : null}
        {!snapshot.isLoading && !data?.tasks.length ? <Surface className="mb-6 p-5"><Text className="text-base font-semibold text-foreground">Tu bandeja está tranquila</Text><Text className="mt-2 text-sm leading-5 text-muted">Captura ahora; lo ordenamos después.</Text></Surface> : null}
        {data?.tasks.slice(0, 3).map((task) => (
          <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)}>
            <Surface className="mb-3 flex-row overflow-hidden">
              <View className={`w-1.5 ${task.atRisk || task.status === "overdue" ? "bg-error" : "bg-primary"}`} />
              <View className="flex-1 p-4">
                <View className="flex-row items-start justify-between"><Text className="flex-1 pr-3 text-base font-semibold text-foreground">{task.title}</Text><Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} /></View>
                <Text className="mt-1 text-sm text-muted">{kindLabel(task.kind)} · {dueHint(task.dueAt)} · bloque de {task.blockMinutes || 15} min</Text>
                {task.atRisk ? <Text className="mt-1 text-xs font-semibold text-error">En riesgo: queda más trabajo que tiempo</Text> : null}
              </View>
            </Surface>
          </Pressable>
        ))}

        <SectionHeader title="Próximos avisos" className="mt-4" />
        {reminders.data?.slice(0, 4).map((reminder) => (
          <Surface key={reminder.id} className="mb-3 p-4">
            <View className="flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-[#F6EBD4]"><IconSymbol name="bell.fill" size={18} color="#9A6B28" /></View>
              <View className="flex-1"><Text className="text-sm font-semibold text-foreground">{reminder.title}</Text><Text className="mt-1 text-xs text-muted">{formatDateTime(reminder.scheduledFor)} · {stageLabel(reminder.stage)}</Text></View>
            </View>
            <View className="mt-3 flex-row gap-2">
              <Tap onPress={() => reminderDone.mutate({ reminderId: reminder.id })} className="rounded-xl bg-[#E1EEE5] px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-primary">Ya está hecho</Text></Tap>
              <Tap onPress={() => snooze.mutate({ reminderId: reminder.id, minutes: 60 })} className="rounded-xl bg-background px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-muted">Posponer 1 h</Text></Tap>
              {reminder.taskId ? <Tap onPress={() => router.push(`/task/${reminder.taskId}`)} className="rounded-xl bg-background px-3 py-2 active:opacity-70"><Text className="text-xs font-bold text-muted">Ver plan</Text></Tap> : null}
            </View>
          </Surface>
        ))}
        {snooze.error ? <Text className="mb-3 text-sm text-error">{snooze.error.message}</Text> : null}
        {!reminders.data?.length ? <Surface className="p-5"><Text className="text-sm leading-5 text-muted">Cuando registres una fecha, aquí verás sus recordatorios progresivos.</Text></Surface> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
