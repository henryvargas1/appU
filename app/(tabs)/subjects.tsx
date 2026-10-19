import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, ButtonLabel, EmptyState, ErrorText, Field, ScreenTitle, SectionHeader, Surface, Tag } from "@/components/uni-flow";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { formatShortDate, kindLabel } from "@/lib/academic-utils";

function useDebounced(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SubjectsScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim());
  const subjects = trpc.subject.list.useQuery({ includeArchived: showArchived });
  const results = trpc.note.search.useQuery({ query: search }, { enabled: search.length >= 2 });
  const create = trpc.subject.create.useMutation({ onSuccess: async () => { setName(""); await utils.subject.invalidate(); } });

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenTitle eyebrow="Tu mapa de clases" title="Materias" subtitle="Cada captura encuentra su lugar para que puedas volver a ella." />

        <Field value={query} onChangeText={setQuery} placeholder="Buscar en notas, tareas y transcripciones" returnKeyType="search" className="mb-5 bg-surface" />
        {search.length >= 2 ? (
          <View className="mb-6">
            {results.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {results.data && !results.data.notes.length && !results.data.tasks.length && !results.data.transcripts.length ? <Text className="text-sm text-muted">Sin resultados para “{search}”.</Text> : null}
            {results.data?.notes.map((note) => (
              <Pressable key={`n${note.id}`} onPress={() => router.push(`/note/${note.id}`)}>
                <Surface className="mb-2 p-3"><Text className="text-xs font-semibold text-primary">Nota · {formatShortDate(note.createdAt)}</Text><Text className="mt-1 text-sm font-semibold text-foreground">{note.title}</Text><Text className="mt-1 text-xs text-muted" numberOfLines={2}>{note.content}</Text></Surface>
              </Pressable>
            ))}
            {results.data?.tasks.map((task) => (
              <Pressable key={`t${task.id}`} onPress={() => router.push(`/task/${task.id}`)}>
                <Surface className="mb-2 p-3"><Text className="text-xs font-semibold text-primary">{kindLabel(task.kind)} · {formatShortDate(task.dueAt)}</Text><Text className="mt-1 text-sm font-semibold text-foreground">{task.title}</Text></Surface>
              </Pressable>
            ))}
            {results.data?.transcripts.map((item) => (
              <Surface key={`a${item.id}`} className="mb-2 p-3"><Text className="text-xs font-semibold text-primary">Transcripción · {formatShortDate(item.createdAt)}</Text><Text className="mt-1 text-xs text-muted" numberOfLines={3}>{item.text}</Text></Surface>
            ))}
          </View>
        ) : null}

        <Surface className="mb-6 p-5">
          <Text className="text-sm font-semibold text-foreground">Añadir una materia</Text>
          <View className="mt-3 flex-row gap-2">
            <Field value={name} onChangeText={setName} placeholder="Ej. Cálculo II" className="flex-1" onSubmitEditing={() => name.trim().length >= 2 && create.mutate({ name: name.trim() })} />
            <ActionButton disabled={create.isPending || name.trim().length < 2} onPress={() => create.mutate({ name: name.trim() })}>{create.isPending ? <ActivityIndicator color="#F7F4EC" /> : <ButtonLabel>Añadir</ButtonLabel>}</ActionButton>
          </View>
          <ErrorText error={create.error} />
        </Surface>

        <SectionHeader title="Mis materias" action={showArchived ? "Ocultar archivadas" : "Ver archivadas"} onAction={() => setShowArchived(!showArchived)} />
        {subjects.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {!subjects.isLoading && !subjects.data?.length ? <EmptyState title="Todavía no hay materias" detail="Crea la primera y úsala al guardar una nota, foto o tarea." /> : null}
        {subjects.data?.map((subject, index) => (
          <Pressable key={subject.id} onPress={() => router.push(`/subject/${subject.id}`)}>
            <Surface className={`mb-3 flex-row items-center p-4 ${subject.isArchived ? "opacity-60" : ""}`}>
              <View className={`mr-4 h-12 w-12 items-center justify-center rounded-2xl ${index % 2 === 0 ? "bg-[#E1EEE5]" : "bg-[#F6EBD4]"}`}><Text className="text-lg font-bold text-primary">{subject.name.slice(0, 1).toUpperCase()}</Text></View>
              <View className="flex-1"><Text className="text-base font-semibold text-foreground">{subject.name}</Text><Text className="mt-1 text-sm text-muted">Notas, capturas, tareas y fechas</Text></View>
              <Tag label={subject.isArchived ? "Archivada" : "Activa"} tone={subject.isArchived ? "neutral" : "sage"} />
            </Surface>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
