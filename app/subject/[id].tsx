import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, BackHeader, ButtonLabel, ErrorText, Field, SectionHeader, Surface, Tag, Tap } from "@/components/uni-flow";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { dueHint, formatShortDate, kindLabel, priorityLabel, priorityTone } from "@/lib/academic-utils";

const fileKind: Record<string, string> = { photo: "Foto", audio: "Audio", document: "Documento" };

export default function SubjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subjectId = Number(id);
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const detail = trpc.subject.detail.useQuery({ subjectId }, { enabled: Number.isFinite(subjectId) });
  const [renaming, setRenaming] = useState<string | null>(null);
  const refresh = () => utils.subject.invalidate();
  const update = trpc.subject.update.useMutation({ onSuccess: async () => { setRenaming(null); await refresh(); } });
  const archive = trpc.subject.archive.useMutation({ onSuccess: refresh });
  const fileUrl = trpc.note.fileUrl.useMutation({ onSuccess: ({ url }) => void Linking.openURL(url) });
  const data = detail.data;

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title="Materia" right={data && renaming === null ? <Pressable hitSlop={10} onPress={() => setRenaming(data.subject.name)}><Text className="font-semibold text-primary">Editar</Text></Pressable> : null} />
      {detail.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      <ErrorText error={detail.error} />
      {data ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
          {renaming !== null ? (
            <View className="flex-row gap-2">
              <Field value={renaming} onChangeText={setRenaming} className="flex-1" autoFocus />
              <ActionButton disabled={renaming.trim().length < 2} onPress={() => update.mutate({ subjectId, name: renaming.trim() })}><ButtonLabel>Guardar</ButtonLabel></ActionButton>
            </View>
          ) : (
            <Text className="text-3xl font-bold tracking-tight text-foreground">{data.subject.name}</Text>
          )}
          <ErrorText error={update.error || archive.error || fileUrl.error} />
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Tag label={`${data.notes.length} notas`} />
            <Tag label={`${data.tasks.filter((task) => task.status !== "completed").length} pendientes`} tone="amber" />
            <Tag label={`${data.attachments.length} archivos`} />
            {data.subject.isArchived ? <Tag label="Archivada" tone="rose" /> : null}
          </View>

          <SectionHeader title="Próximas fechas" className="mt-6" />
          {!data.dates.length ? <Text className="text-sm text-muted">Sin fechas próximas.</Text> : null}
          {data.dates.map((date) => (
            <Tap key={date.id} onPress={() => router.push(`/task/${date.id}`)} className="mb-2 flex-row items-center rounded-xl bg-[#F6EBD4] px-3 py-3">
              <Text className="flex-1 text-sm font-semibold text-[#9A6B28]">{kindLabel(date.kind)}: {date.title}</Text>
              <Text className="text-xs text-[#9A6B28]">{formatShortDate(date.dueAt)} · {dueHint(date.dueAt)}</Text>
            </Tap>
          ))}

          <SectionHeader title="Tareas" className="mt-6" />
          {!data.tasks.length ? <Text className="text-sm text-muted">Sin tareas en esta materia.</Text> : null}
          {data.tasks.map((task) => (
            <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)}>
              <Surface className="mb-2 flex-row items-center p-3">
                <Text className={`flex-1 text-sm ${task.status === "completed" ? "text-muted line-through" : "font-semibold text-foreground"}`}>{task.title}</Text>
                {task.status !== "completed" ? <Tag label={priorityLabel(task.priority)} tone={priorityTone(task.priority)} /> : null}
              </Surface>
            </Pressable>
          ))}

          <SectionHeader title="Notas y transcripciones" className="mt-6" />
          {!data.notes.length ? <Text className="text-sm text-muted">Captura apuntes, fotos o audios de clase y aparecerán aquí.</Text> : null}
          {data.notes.map((note) => (
            <Pressable key={note.id} onPress={() => router.push(`/note/${note.id}`)}>
              <Surface className="mb-2 p-4">
                <Text className="text-sm font-semibold text-foreground">{note.title}</Text>
                <Text className="mt-1 text-xs text-muted">{formatShortDate(note.createdAt)}</Text>
                <Text className="mt-2 text-sm leading-5 text-muted" numberOfLines={3}>{note.summary || note.content}</Text>
              </Surface>
            </Pressable>
          ))}

          <SectionHeader title="Archivos" className="mt-6" />
          {!data.attachments.length ? <Text className="text-sm text-muted">Sin fotos, audios ni documentos.</Text> : null}
          {data.attachments.map((file) => {
            const transcript = data.transcripts.find((item) => item.attachmentId === file.id);
            return (
              <Surface key={file.id} className="mb-2 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>{fileKind[file.kind]} · {file.filename ?? "archivo"}</Text>
                  <Pressable hitSlop={8} onPress={() => fileUrl.mutate({ attachmentId: file.id })}><Text className="text-xs font-semibold text-primary">Abrir</Text></Pressable>
                </View>
                {transcript || file.extractedText ? <Text className="mt-2 text-xs leading-5 text-muted" numberOfLines={4}>{transcript?.text ?? file.extractedText}</Text> : null}
              </Surface>
            );
          })}

          <ActionButton variant={data.subject.isArchived ? "soft" : "danger"} className="mt-8" onPress={() => archive.mutate({ subjectId, archived: !data.subject.isArchived })}>
            <ButtonLabel variant={data.subject.isArchived ? "soft" : "danger"}>{data.subject.isArchived ? "Restaurar materia" : "Archivar materia"}</ButtonLabel>
          </ActionButton>
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
