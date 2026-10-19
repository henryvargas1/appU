import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { Chip, Surface, Tap } from "@/components/uni-flow";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { deviceTimeZone, formatLongDate, kindLabel, priorityLabel } from "@/lib/academic-utils";

type Action = {
  type: "create_task" | "change_due_date" | "summarize_note" | "generate_plan";
  status: "proposed" | "applied" | "dismissed" | "done";
  title?: string;
  kind?: string;
  dueAt?: string | null;
  priority?: string;
  taskId?: number;
  result?: string;
};

function describe(action: Action) {
  if (action.type === "create_task") return `${kindLabel(action.kind ?? "task")}: ${action.title} · ${action.dueAt ? formatLongDate(action.dueAt) : "sin fecha"} · ${priorityLabel(action.priority ?? "medium")}`;
  if (action.type === "change_due_date") return `Nueva fecha: ${formatLongDate(action.dueAt ?? null)}`;
  return null;
}

export default function ChatScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const [threadId, setThreadId] = useState<number | undefined>();
  const [message, setMessage] = useState("");
  const [showThreads, setShowThreads] = useState(false);
  const history = trpc.chat.history.useQuery(threadId ? { threadId } : undefined);
  const threads = trpc.chat.threads.useQuery(undefined, { enabled: showThreads });
  const activeThreadId = history.data?.thread.id;
  const send = trpc.chat.send.useMutation({ onSuccess: () => Promise.all([utils.chat.invalidate(), utils.planner.invalidate(), utils.note.invalidate()]) });
  const newThread = trpc.chat.newThread.useMutation({ onSuccess: async (thread) => { setThreadId(thread.id); setShowThreads(false); await utils.chat.invalidate(); } });
  const resolve = trpc.chat.resolveAction.useMutation({ onSuccess: () => Promise.all([utils.chat.history.invalidate(), utils.task.invalidate(), utils.planner.invalidate()]) });
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [history.data?.messages.length, send.isPending]);

  const submit = (text = message) => {
    if (!text.trim() || send.isPending) return;
    setMessage("");
    send.mutate({ threadId: activeThreadId, message: text.trim(), timeZone: deviceTimeZone });
  };
  const suggestions = ["¿Qué tengo esta semana?", "¿Qué dijo el profesor del examen?", "Hazme preguntas sobre derivadas", "Organiza mi plan", "Crea una tarea: taller de cálculo el viernes"];

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88}>
        <View className="flex-row items-end justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Tu copiloto académico</Text>
            <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Chat</Text>
          </View>
          <View className="flex-row gap-2">
            <Tap accessibilityLabel="Conversaciones" onPress={() => setShowThreads(!showThreads)} className="h-10 w-10 items-center justify-center rounded-xl bg-surface"><IconSymbol name="message.fill" size={18} color={colors.primary} /></Tap>
            <Tap accessibilityLabel="Nueva conversación" onPress={() => newThread.mutate()} className="h-10 w-10 items-center justify-center rounded-xl bg-surface"><IconSymbol name="plus" size={20} color={colors.primary} /></Tap>
          </View>
        </View>
        <Text className="mt-1 text-sm text-muted" numberOfLines={1}>{history.data?.thread.title ?? "Pregunta por tus notas, prioridades o el próximo paso."}</Text>

        {showThreads ? (
          <Surface className="mt-3 max-h-56 p-2">
            <ScrollView>
              {threads.data?.map((thread) => (
                <Tap key={thread.id} onPress={() => { setThreadId(thread.id); setShowThreads(false); }} className={`rounded-xl px-3 py-3 ${thread.id === activeThreadId ? "bg-[#E1EEE5]" : ""}`}>
                  <Text className="text-sm text-foreground" numberOfLines={1}>{thread.title}</Text>
                </Tap>
              ))}
            </ScrollView>
          </Surface>
        ) : null}

        <ScrollView ref={scrollRef} className="mt-4 flex-1" contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {history.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {!history.isLoading && !history.data?.messages.length ? <Surface className="mb-4 p-5"><Text className="text-base font-semibold text-foreground">Empieza por una pregunta</Text><Text className="mt-2 text-sm leading-5 text-muted">UniFlow responde primero con tus tareas y notas guardadas, sin inventar fechas. Si pides crear o mover algo, te lo propone para que lo confirmes.</Text></Surface> : null}
          {history.data?.messages.map((item) => (
            <View key={item.id} className={`mb-3 max-w-[88%] ${item.role === "user" ? "self-end" : "self-start"}`}>
              <View className={`rounded-3xl px-4 py-3 ${item.role === "user" ? "bg-primary" : "border border-border bg-surface"}`}>
                <Text selectable className={`text-sm leading-5 ${item.role === "user" ? "text-background" : "text-foreground"}`}>{item.content}</Text>
              </View>
              {(item.actions as Action[]).map((action, index) => {
                const detail = describe(action);
                if (!detail) return null;
                return (
                  <View key={index} className="mt-2 rounded-2xl border border-primary bg-[#E1EEE5] p-3">
                    <Text className="text-xs font-semibold text-primary">{action.type === "create_task" ? "Crear tarea" : "Cambiar fecha"}</Text>
                    <Text className="mt-1 text-sm text-foreground">{detail}</Text>
                    {action.status === "proposed" ? (
                      <View className="mt-2 flex-row gap-2">
                        <Tap disabled={resolve.isPending} onPress={() => resolve.mutate({ messageId: item.id, index, accept: true })} className="rounded-xl bg-primary px-3 py-2"><Text className="text-xs font-bold text-background">Confirmar</Text></Tap>
                        <Tap disabled={resolve.isPending} onPress={() => resolve.mutate({ messageId: item.id, index, accept: false })} className="rounded-xl bg-surface px-3 py-2"><Text className="text-xs font-bold text-muted">Descartar</Text></Tap>
                      </View>
                    ) : <Text className="mt-2 text-xs text-muted">{action.status === "applied" ? `✓ ${action.result ?? "Aplicado"}` : "Descartado"}</Text>}
                  </View>
                );
              })}
            </View>
          ))}
          {send.isPending ? <View className="self-start rounded-3xl border border-border bg-surface px-4 py-3"><ActivityIndicator color={colors.primary} /></View> : null}
          {send.error ? <Text className="text-sm text-error">{send.error.message}</Text> : null}
          {resolve.error ? <Text className="text-sm text-error">{resolve.error.message}</Text> : null}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mb-3 max-h-11" contentContainerStyle={{ gap: 8 }}>
          {suggestions.map((item) => <Chip key={item} label={item} onPress={() => submit(item)} />)}
        </ScrollView>
        <View className="mb-2 flex-row items-end rounded-2xl border border-border bg-surface px-3 py-2">
          <TextInput value={message} onChangeText={setMessage} onSubmitEditing={() => submit()} placeholder="Escribe tu pregunta..." placeholderTextColor="#718078" multiline className="max-h-24 flex-1 px-2 py-1 text-base leading-5 text-foreground" />
          <Tap accessibilityLabel="Enviar" onPress={() => submit()} disabled={send.isPending} className="ml-2 h-10 w-10 items-center justify-center rounded-xl bg-primary active:opacity-70"><IconSymbol name="paperplane.fill" size={18} color={colors.background} /></Tap>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
