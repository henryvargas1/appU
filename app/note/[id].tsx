import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, BackHeader, ButtonLabel, ErrorText, Field, FieldLabel, SectionHeader, SubjectPicker, Surface } from "@/components/uni-flow";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/academic-utils";

type Segment = { start: number; end: number; text: string };

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = Number(id);
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const detail = trpc.note.get.useQuery({ noteId }, { enabled: Number.isFinite(noteId) });
  const subjects = trpc.subject.list.useQuery();
  const [draft, setDraft] = useState<{ title: string; content: string; subjectId: number | null } | null>(null);
  const refresh = () => Promise.all([utils.note.invalidate(), utils.subject.invalidate()]);
  const update = trpc.note.update.useMutation({ onSuccess: async () => { setDraft(null); await refresh(); } });
  const summarize = trpc.note.summarize.useMutation({ onSuccess: refresh });
  const remove = trpc.note.delete.useMutation({ onSuccess: async () => { await refresh(); router.back(); } });
  const fileUrl = trpc.note.fileUrl.useMutation({ onSuccess: ({ url }) => void Linking.openURL(url) });
  const data = detail.data;
  const segments: Segment[] = data?.transcript?.segments ? (JSON.parse(data.transcript.segments) as Segment[]) : [];

  const askDelete = () => {
    const run = () => remove.mutate({ noteId });
    if (Platform.OS === "web") return window.confirm("¿Eliminar esta nota?") && run();
    Alert.alert("UniFlow", "¿Eliminar esta nota?", [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: run }]);
  };

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title="Nota" right={data && !draft ? <Pressable hitSlop={10} onPress={() => setDraft({ title: data.note.title, content: data.note.content, subjectId: data.note.subjectId })}><Text className="font-semibold text-primary">Editar</Text></Pressable> : null} />
      {detail.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      <ErrorText error={detail.error} />
      {data ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
          {draft ? (
            <>
              <FieldLabel>Título</FieldLabel>
              <Field value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
              <FieldLabel>Contenido</FieldLabel>
              <Field value={draft.content} onChangeText={(content) => setDraft({ ...draft, content })} multiline textAlignVertical="top" className="min-h-[200px]" />
              <FieldLabel>Materia</FieldLabel>
              <SubjectPicker subjects={subjects.data ?? []} value={draft.subjectId} onChange={(subjectId) => setDraft({ ...draft, subjectId })} />
              <View className="mt-5 flex-row gap-2">
                <ActionButton className="flex-1" disabled={update.isPending} onPress={() => update.mutate({ noteId, ...draft })}><ButtonLabel>Guardar</ButtonLabel></ActionButton>
                <ActionButton variant="soft" onPress={() => setDraft(null)}><ButtonLabel variant="soft">Cancelar</ButtonLabel></ActionButton>
              </View>
            </>
          ) : (
            <>
              <Text className="text-3xl font-bold tracking-tight text-foreground">{data.note.title}</Text>
              <Text className="mt-2 text-xs text-muted">{formatDateTime(data.note.createdAt)}</Text>

              <Surface className="mt-5 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-primary">Resumen</Text>
                  <Pressable hitSlop={8} onPress={() => summarize.mutate({ noteId })}><Text className="text-xs font-semibold text-primary">{summarize.isPending ? "Resumiendo…" : data.note.summary ? "Actualizar" : "Resumir"}</Text></Pressable>
                </View>
                <Text className="mt-2 text-sm leading-6 text-foreground">{data.note.summary || "Toca “Resumir” para obtener los puntos clave."}</Text>
              </Surface>

              <Text selectable className="mt-5 text-base leading-7 text-foreground">{data.note.content}</Text>
            </>
          )}
          <ErrorText error={update.error || summarize.error || remove.error || fileUrl.error} />

          {data.attachment ? (
            <>
              <SectionHeader title="Original" className="mt-6" action="Abrir" onAction={() => fileUrl.mutate({ attachmentId: data.attachment!.id })} />
              <Text className="text-sm text-muted">{data.attachment.filename}</Text>
            </>
          ) : null}

          {segments.length ? (
            <>
              <SectionHeader title="Transcripción por tiempos" className="mt-6" />
              {segments.map((segment, index) => (
                <View key={index} className="mb-2 flex-row">
                  <Text className="w-12 text-xs font-semibold text-primary">{clock(segment.start)}</Text>
                  <Text selectable className="flex-1 text-sm leading-5 text-foreground">{segment.text}</Text>
                </View>
              ))}
            </>
          ) : null}

          {!draft ? <ActionButton variant="danger" className="mt-8" onPress={askDelete}><ButtonLabel variant="danger">Eliminar nota</ButtonLabel></ActionButton> : null}
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
