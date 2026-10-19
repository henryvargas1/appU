import { useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, BackHeader, ButtonLabel, ErrorText, Field, SectionHeader, Surface, Tag, Tap } from "@/components/uni-flow";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { shareTextFile } from "@/lib/share-file";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function AvailabilityCard({ initial }: { initial: { availability: number[]; studyStartHour: number } }) {
  const utils = trpc.useUtils();
  const [availability, setAvailability] = useState<string[]>(() => initial.availability.map(String));
  const [startHour, setStartHour] = useState(() => String(initial.studyStartHour));
  const [saved, setSaved] = useState(false);
  const update = trpc.settings.update.useMutation({ onSuccess: async () => { setSaved(true); await Promise.all([utils.settings.invalidate(), utils.planner.invalidate()]); } });

  const save = () => {
    setSaved(false);
    update.mutate({
      availability: availability.map((value) => Math.min(600, Math.max(0, Number.parseInt(value, 10) || 0))),
      studyStartHour: Math.min(22, Math.max(5, Number.parseInt(startHour, 10) || 17)),
    });
  };

  return (
    <Surface className="p-4">
      <Text className="text-sm leading-5 text-muted">Minutos máximos por día. Solo evitan choques imposibles: el tiempo de estudio lo decide tu carga (complejidad, urgencia y tareas acumuladas). Usa 0 para “sin límite”.</Text>
      <View className="mt-4 flex-row justify-between">
        {DAYS.map((day, index) => (
          <View key={day} className="items-center">
            <Text className="mb-1 text-xs font-semibold text-foreground">{day}</Text>
            <Field value={availability[index]} onChangeText={(value) => setAvailability((current) => current.map((item, i) => (i === index ? value : item)))} keyboardType="number-pad" className="w-11 px-1 text-center text-sm" />
          </View>
        ))}
      </View>
      <View className="mt-4 flex-row items-center">
        <Text className="flex-1 text-sm text-foreground">Hora de inicio de estudio</Text>
        <Field value={startHour} onChangeText={setStartHour} keyboardType="number-pad" className="w-16 text-center" />
      </View>
      <ActionButton className="mt-4" disabled={update.isPending} onPress={save}><ButtonLabel>{update.isPending ? "Guardando…" : "Guardar y recalcular plan"}</ButtonLabel></ActionButton>
      {saved ? <Text className="mt-2 text-center text-sm text-primary">Listo. Tu plan se recalculó.</Text> : null}
      <ErrorText error={update.error} />
    </Surface>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const { user, logout } = useAuth();
  const settings = trpc.settings.get.useQuery();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const update = trpc.settings.update.useMutation({ onSuccess: () => utils.settings.invalidate() });
  const exportJson = trpc.export.json.useMutation();
  const exportMarkdown = trpc.export.markdown.useMutation();
  const exportCalendar = trpc.export.calendar.useMutation();

  const runExport = async (mutation: { mutateAsync: () => Promise<{ filename: string; mimeType: string; content: string }> }) => {
    try {
      setExportStatus("Preparando archivo…");
      const file = await mutation.mutateAsync();
      await shareTextFile(file.filename, file.mimeType, file.content);
      setExportStatus(null);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "No fue posible exportar.");
    }
  };

  return (
    <ScreenContainer className="px-5 pt-2" edges={["top", "left", "right", "bottom"]}>
      <BackHeader title="Ajustes" />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
        {settings.isLoading ? <ActivityIndicator color={colors.primary} /> : null}

        <SectionHeader title="Disponibilidad semanal" />
        {settings.data ? <AvailabilityCard initial={settings.data} /> : null}

        <SectionHeader title="Recordatorios" className="mt-6" />
        <Surface className="flex-row items-center p-4">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-foreground">Notificaciones en este iPhone</Text>
            <Text className="mt-1 text-xs leading-5 text-muted">Avisos semanales y reforzados antes de cada examen o entrega, con “Ya está hecho”, “Posponer” y “Ver plan”. Se detienen al completar o al vencer la fecha.</Text>
          </View>
          <Switch value={settings.data?.remindersEnabled ?? true} onValueChange={(value) => update.mutate({ remindersEnabled: value })} trackColor={{ true: colors.primary }} />
        </Surface>

        <SectionHeader title="Exportar y respaldar" className="mt-6" />
        <Surface className="p-4">
          <Text className="text-sm leading-5 text-muted">Tus datos viven en la nube. Exporta copias portables y elige “Guardar en Archivos” para dejarlas en iCloud Drive.</Text>
          <ActionButton variant="soft" className="mt-4" onPress={() => void runExport(exportCalendar)}><ButtonLabel variant="soft">Calendario (.ics para Apple Calendar)</ButtonLabel></ActionButton>
          <ActionButton variant="soft" className="mt-2" onPress={() => void runExport(exportMarkdown)}><ButtonLabel variant="soft">Notas y tareas (.md)</ButtonLabel></ActionButton>
          <ActionButton variant="soft" className="mt-2" onPress={() => void runExport(exportJson)}><ButtonLabel variant="soft">Todos mis datos (.json)</ButtonLabel></ActionButton>
          {exportStatus ? <Text className="mt-2 text-center text-sm text-primary">{exportStatus}</Text> : null}
        </Surface>

        <SectionHeader title="Integraciones" className="mt-6" />
        <Surface className="p-4">
          {[
            { name: "iCloud Drive", detail: "Mediante exportación a Archivos", ready: true },
            { name: "Google Drive", detail: "Requiere autorización de Google; se configurará más adelante", ready: false },
            { name: "WhatsApp", detail: "Requiere una integración autorizada; no es necesaria para usar UniFlow", ready: false },
          ].map((item) => (
            <View key={item.name} className="mb-3 flex-row items-center">
              <View className="flex-1 pr-3"><Text className="text-sm font-semibold text-foreground">{item.name}</Text><Text className="mt-1 text-xs text-muted">{item.detail}</Text></View>
              <Tag label={item.ready ? "Disponible" : "Próximamente"} tone={item.ready ? "sage" : "neutral"} />
            </View>
          ))}
          <View className="flex-row items-center">
            <View className="flex-1 pr-3"><Text className="text-sm font-semibold text-foreground">Procesamiento con IA</Text><Text className="mt-1 text-xs text-muted">Lectura de fotos y documentos, transcripción y chat avanzado</Text></View>
            <Tag label={settings.data?.aiAvailable ? "Activo" : "Modo básico"} tone={settings.data?.aiAvailable ? "sage" : "amber"} />
          </View>
        </Surface>

        <SectionHeader title="Cuenta y privacidad" className="mt-6" />
        <Surface className="p-4">
          <Text className="text-sm text-foreground">{user?.name ?? "Estudiante"}</Text>
          {user?.email ? <Text className="mt-1 text-xs text-muted">{user.email}</Text> : null}
          <Text className="mt-3 text-xs leading-5 text-muted">Tus materias, notas, archivos y conversaciones solo son visibles para tu cuenta. Al eliminar una nota o tarea se oculta de la app; puedes exportar tus datos en cualquier momento.</Text>
          <Tap onPress={() => void logout()} className="mt-4 self-start rounded-xl bg-[#F6E2E0] px-4 py-2 active:opacity-70"><Text className="text-sm font-semibold text-[#A6534E]">Cerrar sesión</Text></Tap>
        </Surface>
      </ScrollView>
    </ScreenContainer>
  );
}
