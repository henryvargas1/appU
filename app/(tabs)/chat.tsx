import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { Surface } from "@/components/uni-flow";
import { trpc } from "@/lib/trpc";

export default function ChatScreen() {
  const history = trpc.chat.history.useQuery();
  const utils = trpc.useUtils();
  const send = trpc.chat.send.useMutation({ onSuccess: () => { void utils.chat.history.invalidate(); setMessage(""); } });
  const [message, setMessage] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [history.data?.messages.length]);
  const submit = () => { if (message.trim() && !send.isPending) send.mutate({ message: message.trim() }); };
  const suggestions = ["¿Qué tengo esta semana?", "Organiza mi tarea más urgente", "Hazme preguntas para repasar"];

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88}>
        <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Tu copiloto académico</Text>
        <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Chat</Text>
        <Text className="mt-2 text-base leading-6 text-muted">Pregunta por tus notas, prioridades o el próximo paso.</Text>
        <ScrollView ref={scrollRef} className="mt-6 flex-1" contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {!history.data?.messages.length ? <Surface className="mb-4 p-5"><Text className="text-base font-semibold text-foreground">Empieza por una pregunta</Text><Text className="mt-2 text-sm leading-5 text-muted">UniFlow usará tus tareas y notas guardadas para responder sin inventar fechas.</Text></Surface> : null}
          {history.data?.messages.map((item) => <View key={item.id} className={`mb-3 max-w-[88%] ${item.role === "user" ? "self-end" : "self-start"}`}><View className={`rounded-3xl px-4 py-3 ${item.role === "user" ? "bg-primary" : "border border-border bg-surface"}`}><Text className={`text-sm leading-5 ${item.role === "user" ? "text-background" : "text-foreground"}`}>{item.content}</Text></View></View>)}
          {send.isPending ? <View className="self-start rounded-3xl border border-border bg-surface px-4 py-3"><ActivityIndicator color="#486B5A" /></View> : null}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 max-h-10">{suggestions.map((item) => <Pressable key={item} onPress={() => setMessage(item)} className="mr-2 rounded-full border border-border bg-surface px-3 py-2"><Text className="text-xs text-muted">{item}</Text></Pressable>)}</ScrollView>
        <View className="mb-2 flex-row items-end rounded-2xl border border-border bg-surface px-3 py-2"><TextInput value={message} onChangeText={setMessage} onSubmitEditing={submit} placeholder="Escribe tu pregunta..." placeholderTextColor="#718078" multiline className="max-h-24 flex-1 px-2 py-1 text-base leading-5 text-foreground" /><Pressable onPress={submit} className="ml-2 h-10 w-10 items-center justify-center rounded-xl bg-primary active:opacity-70"><Text className="text-lg font-bold text-background">↑</Text></Pressable></View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
