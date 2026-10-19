import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { BackHeader, ErrorText } from "@/components/uni-flow";
import { TaskForm } from "@/components/task-form";
import { trpc } from "@/lib/trpc";

export default function NewTaskScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const subjects = trpc.subject.list.useQuery();
  const create = trpc.task.create.useMutation({
    onSuccess: async (task) => {
      await Promise.all([utils.task.invalidate(), utils.planner.invalidate()]);
      router.replace(`/task/${task.id}`);
    },
  });

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title="Nueva tarea" />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <TaskForm
          initial={{ type: "task" }}
          allowNote={false}
          subjects={subjects.data ?? []}
          submitLabel="Crear tarea"
          pending={create.isPending}
          onSubmit={(values) => create.mutate({
            title: values.title,
            description: values.content || null,
            kind: values.type === "exam" || values.type === "delivery" ? values.type : "task",
            subjectId: values.subjectId,
            dueAt: values.dueAt,
            priority: values.priority,
            complexity: values.complexity,
            estimatedMinutes: values.estimatedMinutes,
            steps: values.steps,
          })}
        />
        <ErrorText error={create.error} />
      </ScrollView>
    </ScreenContainer>
  );
}
