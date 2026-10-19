import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, BackHeader, ButtonLabel, ErrorText, Surface, Tag } from "@/components/uni-flow";
import { TaskForm, type TaskFormPriority, type TaskFormType } from "@/components/task-form";
import { trpc } from "@/lib/trpc";
import { kindLabel } from "@/lib/academic-utils";

type Suggestion = {
  type?: TaskFormType;
  title?: string;
  dueAt?: string | null;
  subjectId?: number | null;
  priority?: TaskFormPriority;
  complexity?: number;
  estimatedMinutes?: number;
  steps?: string[];
  concepts?: string[];
  summary?: string;
};

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const router = useRouter();
  const utils = trpc.useUtils();
  const entry = trpc.inbox.get.useQuery({ entryId }, { enabled: Number.isFinite(entryId) });
  const subjects = trpc.subject.list.useQuery();
  const done = async () => {
    await Promise.all([utils.inbox.invalidate(), utils.task.invalidate(), utils.planner.invalidate(), utils.note.invalidate(), utils.subject.invalidate()]);
    router.back();
  };
  const confirm = trpc.inbox.confirm.useMutation({ onSuccess: done });
  const discard = trpc.inbox.discard.useMutation({ onSuccess: done });

  const suggestion = (entry.data?.suggestion ?? {}) as Suggestion;
  const dueAt = suggestion.dueAt ? new Date(suggestion.dueAt) : null;

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title="Revisar captura" />
      {entry.isLoading ? <ActivityIndicator /> : null}
      <ErrorText error={entry.error} />
      {entry.data ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <Surface className="p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-primary">Sugerencia de UniFlow</Text>
              <Tag label={kindLabel(suggestion.type ?? "note")} tone="sage" />
            </View>
            {suggestion.summary ? <Text className="mt-2 text-sm leading-5 text-muted" numberOfLines={6}>{suggestion.summary}</Text> : null}
            {suggestion.concepts?.length ? <View className="mt-3 flex-row flex-wrap gap-2">{suggestion.concepts.map((concept) => <Tag key={concept} label={concept} />)}</View> : null}
            {entry.data.content && entry.data.kind !== "text" ? (
              <View className="mt-3 rounded-xl bg-background p-3">
                <Text className="text-xs font-semibold text-foreground">{entry.data.kind === "audio" ? "Transcripción" : "Texto extraído"}</Text>
                <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={10}>{entry.data.content}</Text>
              </View>
            ) : null}
            <Text className="mt-3 text-xs text-muted">Corrige lo que haga falta antes de guardar.</Text>
          </Surface>

          <TaskForm
            key={entry.data.id}
            initial={{
              type: suggestion.type ?? "note",
              title: suggestion.title ?? entry.data.title ?? "",
              content: entry.data.content ?? "",
              subjectId: suggestion.subjectId ?? entry.data.subjectId ?? null,
              dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
              priority: suggestion.priority ?? "medium",
              complexity: suggestion.complexity ?? 2,
              estimatedMinutes: suggestion.estimatedMinutes ?? 30,
              steps: suggestion.steps ?? [],
            }}
            subjects={subjects.data ?? []}
            submitLabel="Confirmar y guardar"
            pending={confirm.isPending}
            onSubmit={(values) => confirm.mutate({
              entryId,
              type: values.type,
              title: values.title,
              content: values.content,
              subjectId: values.subjectId,
              dueAt: values.dueAt,
              priority: values.priority,
              complexity: values.complexity,
              estimatedMinutes: values.estimatedMinutes,
              steps: values.steps,
            })}
          />
          <ErrorText error={confirm.error} />
          <ActionButton variant="danger" className="mt-3" disabled={discard.isPending} onPress={() => discard.mutate({ entryId })}>
            <ButtonLabel variant="danger">Descartar captura</ButtonLabel>
          </ActionButton>
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
