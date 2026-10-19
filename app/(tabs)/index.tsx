import { ScrollView, Text, View, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ProgressBar, SectionHeader, Surface, Tag } from "@/components/uni-flow";
import { trpc } from "@/lib/trpc";
import { dueHint, formatShortDate, priorityLabel, priorityTone } from "@/lib/academic-utils";
import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const snapshot = trpc.planner.snapshot.useQuery();
  const reminders = trpc.planner.reminders.useQuery();
  const firstName = user?.name?.split(" ")[0] || "estudiante";
  const data = snapshot.data;
  const completion = data?.totalActive ? Math.max(8, 100 - data.totalActive * 6) : 100;

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="mb-7 flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Lunes · tu centro académico</Text>
            <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Hola, {firstName}.</Text>
            <Text className="mt-2 text-base leading-6 text-muted">Hoy solo necesitas avanzar en el siguiente paso.</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary"><Text className="text-xl font-bold text-background">U</Text></View>
        </View>

        <Surface className="mb-7 overflow-hidden p-5">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3"><Text className="text-sm font-semibold text-primary">Plan de hoy</Text><Text className="mt-1 text-2xl font-bold text-foreground">{data?.recommendedMinutes ?? "—"} min</Text><Text className="mt-1 text-sm leading-5 text-muted">{data?.nextAction ?? "Calculando tu siguiente paso..."}</Text></View>
            <View className="h-12 w-12 items-center justify-center rounded-full border-4 border-[#CFE0D3]"><Text className="text-sm font-bold text-primary">{completion}%</Text></View>
          </View>
          <ProgressBar value={completion} className="mt-5" />
          <Pressable onPress={() => router.push("/(tabs)/tasks")} className="mt-4 self-start rounded-xl bg-background px-3 py-2 active:opacity-70"><Text className="text-sm font-semibold text-primary">Ver mi plan →</Text></Pressable>
        </Surface>

        <SectionHeader title="Prioridad ahora" action="Capturar" onAction={() => router.push("/(tabs)/capture")} />
        {snapshot.isLoading ? <ActivityIndicator color="#486B5A" /> : null}
        {!snapshot.isLoading && !data?.tasks.length ? <Surface className="mb-7 p-5"><Text className="text-base font-semibold text-foreground">Tu bandeja está tranquila</Text><Text className="mt-2 text-sm leading-5 text-muted">Captura una tarea o una nota de clase y UniFlow organizará el siguiente paso.</Text></Surface> : null}
        {data?.tasks.slice(0, 3).map((task) => (
          <Surface key={task.id} className="mb-3 p-4">
            <View className="flex-row items-start justify-between"><View className="flex-1 pr-3"><Text className="text-base font-semibold text-foreground">{task.title}</Text><Text className="mt-1 text-sm text-muted">{dueHint(task.dueAt)} · {task.estimatedMinutes} min estimados</Text></View><Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} /></View>
            <View className="mt-3 flex-row items-center justify-between"><Text className="text-xs text-muted">Complejidad {task.complexity}/5</Text><Text className="text-xs font-semibold text-primary">Abrir plan →</Text></View>
          </Surface>
        ))}

        <SectionHeader title="Próximos avisos" />
        {reminders.data?.slice(0, 3).map((reminder) => <Surface key={reminder.id} className="mb-3 flex-row items-center p-4"><View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-[#F6EBD4]"><Text>!</Text></View><View className="flex-1"><Text className="text-sm font-semibold text-foreground">{reminder.title}</Text><Text className="mt-1 text-xs text-muted">{formatShortDate(reminder.scheduledFor)} · {reminder.stage === "weekly" ? "Aviso semanal" : "Aviso reforzado"}</Text></View></Surface>)}
        {!reminders.data?.length ? <Surface className="p-5"><Text className="text-sm leading-5 text-muted">Cuando registres una fecha, aquí verás sus recordatorios progresivos.</Text></Surface> : null}
      </ScrollView>
    </ScreenContainer>
  );
}
