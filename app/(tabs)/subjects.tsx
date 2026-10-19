import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, EmptyState, SectionHeader, Surface, Tag } from "@/components/uni-flow";
import { trpc } from "@/lib/trpc";

export default function SubjectsScreen() {
  const utils = trpc.useUtils();
  const subjects = trpc.subject.list.useQuery();
  const create = trpc.subject.create.useMutation({ onSuccess: () => { void utils.subject.list.invalidate(); setName(""); setStatus("Materia creada."); } });
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Tu mapa de clases</Text>
        <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Materias</Text>
        <Text className="mt-2 text-base leading-6 text-muted">Cada captura encuentra su lugar para que puedas volver a ella.</Text>
        <Surface className="mt-6 mb-7 p-5"><Text className="text-sm font-semibold text-foreground">Añadir una materia</Text><View className="mt-3 flex-row"><TextInput value={name} onChangeText={setName} placeholder="Ej. Cálculo II" placeholderTextColor="#718078" className="flex-1 rounded-xl border border-border bg-background px-3 py-3 text-foreground" /><ActionButton onPress={() => { if (name.trim()) create.mutate({ name: name.trim() }); }} className="ml-2 px-4 py-3">{create.isPending ? <ActivityIndicator color="#F7F4EC" /> : <Text className="font-semibold text-background">Añadir</Text>}</ActionButton></View>{status ? <Text className="mt-3 text-sm text-primary">{status}</Text> : null}</Surface>
        <SectionHeader title="Mis materias" />
        {subjects.isLoading ? <ActivityIndicator color="#486B5A" /> : null}
        {!subjects.isLoading && !subjects.data?.length ? <EmptyState title="Todavía no hay materias" detail="Crea la primera y úsala al guardar una nota, foto o tarea." /> : null}
        {subjects.data?.map((subject, index) => <Surface key={subject.id} className="mb-3 flex-row items-center p-4"><View className={`mr-4 h-12 w-12 items-center justify-center rounded-2xl ${index % 2 === 0 ? "bg-[#E1EEE5]" : "bg-[#F6EBD4]"}`}><Text className="text-lg font-bold text-primary">{subject.name.slice(0, 1).toUpperCase()}</Text></View><View className="flex-1"><Text className="text-base font-semibold text-foreground">{subject.name}</Text><Text className="mt-1 text-sm text-muted">Lista para recibir tus capturas</Text></View><Tag label="Activa" tone="sage" /></Surface>)}
      </ScrollView>
    </ScreenContainer>
  );
}
