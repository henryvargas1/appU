import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, ButtonLabel, Field, ScreenTitle, SectionHeader, SubjectPicker, Surface, Tag, Tap } from "@/components/uni-flow";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { deviceTimeZone, formatDateTime, kindLabel } from "@/lib/academic-utils";
import { uploadDeviceFile } from "@/lib/upload";

type CaptureKind = "text" | "photo" | "audio" | "document";
type Staged = { uri: string; name: string; mimeType?: string };

const modes: { key: CaptureKind; label: string; icon: "doc.text" | "camera.fill" | "mic.fill" | "tray.fill" }[] = [
  { key: "text", label: "Texto", icon: "doc.text" },
  { key: "photo", label: "Foto", icon: "camera.fill" },
  { key: "audio", label: "Audio", icon: "mic.fill" },
  { key: "document", label: "Archivo", icon: "tray.fill" },
];

function formatSeconds(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function CaptureScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ mode?: CaptureKind }>();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const utils = trpc.useUtils();
  const subjects = trpc.subject.list.useQuery();
  const inbox = trpc.inbox.list.useQuery();
  const [kind, setKind] = useState<CaptureKind>("text");
  const [content, setContent] = useState("");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const analyze = trpc.inbox.analyze.useMutation();

  const reset = () => { setContent(""); setStaged(null); setSubjectId(null); setKind("text"); };

  const takePhoto = async (fromCamera: boolean) => {
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setStatus("Necesitamos permiso para usar la cámara o tus fotos.");
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setKind("photo");
    setStaged({ uri: asset.uri, name: asset.fileName || `foto-${Date.now()}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" });
    setStatus("Foto lista. Al procesar, se sube y se lee en la nube.");
  };

  const chooseDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: ["application/pdf", "image/*", "text/plain", "audio/*"] });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const isAudio = asset.mimeType?.startsWith("audio/");
    setKind(isAudio ? "audio" : asset.mimeType?.startsWith("image/") ? "photo" : "document");
    setStaged({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    setStatus(isAudio ? "Audio listo. Al procesar, se transcribe en la nube." : "Archivo listo. Al procesar, se lee en la nube.");
  };

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri) {
        setStaged({ uri: recorder.uri, name: `audio-clase-${Date.now()}.m4a`, mimeType: "audio/mp4" });
        setStatus("Audio listo. Al procesar, se transcribe en español en la nube.");
      }
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return setStatus("Necesitamos permiso para usar el micrófono.");
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setKind("audio");
    setStaged(null);
    setStatus("Grabando… toca Detener cuando termines.");
  };

  const selectMode = (mode: CaptureKind) => {
    setKind(mode);
    if (mode !== "audio" && staged?.mimeType?.startsWith("audio/")) setStaged(null);
    if (mode === "photo") void takePhoto(true);
    if (mode === "document") void chooseDocument();
    if (mode === "audio" && !recorderState.isRecording) void toggleRecording();
  };

  // Captura con un toque desde la pantalla de Inicio.
  useEffect(() => {
    if (!params.mode) return;
    const mode = params.mode;
    router.setParams({ mode: undefined });
    // Abre la cámara, el selector o el micrófono fuera del ciclo de render.
    void Promise.resolve().then(() => selectMode(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode]);

  const submit = async () => {
    if (!content.trim() && !staged) return setStatus("Escribe algo o adjunta una foto, audio o archivo.");
    setBusy(true);
    try {
      let attachmentKey: string | undefined;
      if (staged) {
        setStatus("Subiendo a la nube…");
        const uploaded = await uploadDeviceFile(staged.uri, kind === "text" ? "document" : kind, staged.name, staged.mimeType);
        attachmentKey = uploaded.key;
        setStatus(kind === "audio" ? "Transcribiendo y clasificando…" : "Leyendo y clasificando…");
      } else {
        setStatus("Clasificando…");
      }
      const result = await analyze.mutateAsync({ kind: staged ? (kind === "text" ? "document" : kind) : "text", content: content.trim() || undefined, subjectId, attachmentKey, timeZone: deviceTimeZone });
      await utils.inbox.list.invalidate();
      reset();
      setStatus(null);
      router.push(`/review/${result.entry.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible procesar la captura.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenTitle eyebrow="Bandeja de entrada" title="Capturar" subtitle="Captura ahora; lo ordenamos después." />

        <View className="flex-row gap-2">
          {modes.map((mode) => {
            const recording = mode.key === "audio" && recorderState.isRecording;
            return (
              <Tap key={mode.key} onPress={() => (recording ? void toggleRecording() : selectMode(mode.key))} className={`flex-1 items-center rounded-2xl border px-2 py-3 ${kind === mode.key ? "border-primary bg-[#E1EEE5]" : "border-border bg-surface"}`}>
                <IconSymbol name={recording ? "xmark" : mode.icon} size={22} color={recording ? colors.error : colors.primary} />
                <Text className="mt-1 text-xs font-semibold text-foreground">{recording ? "Detener" : mode.label}</Text>
              </Tap>
            );
          })}
        </View>

        <Surface className="mt-5 p-5">
          {recorderState.isRecording ? (
            <View className="mb-4 flex-row items-center rounded-xl bg-[#F6E2E0] px-3 py-3"><View className="mr-2 h-3 w-3 rounded-full bg-error" /><Text className="font-semibold text-[#A6534E]">Grabando {formatSeconds(recorderState.durationMillis)}</Text></View>
          ) : null}
          {kind === "photo" && !staged ? (
            <View className="mb-4 flex-row gap-2">
              <ActionButton variant="soft" className="flex-1" onPress={() => void takePhoto(true)}><ButtonLabel variant="soft">Tomar foto</ButtonLabel></ActionButton>
              <ActionButton variant="soft" className="flex-1" onPress={() => void takePhoto(false)}><ButtonLabel variant="soft">Elegir de Fotos</ButtonLabel></ActionButton>
            </View>
          ) : null}
          {staged ? (
            <View className="mb-4 flex-row items-center rounded-xl bg-background px-3 py-2">
              <Text className="flex-1 text-xs text-muted" numberOfLines={1}>Adjunto: {staged.name}</Text>
              <Pressable hitSlop={8} onPress={() => setStaged(null)}><Text className="text-xs font-semibold text-primary">Quitar</Text></Pressable>
            </View>
          ) : null}
          <Field
            value={content}
            onChangeText={setContent}
            placeholder={staged ? "Añade contexto (opcional)" : "Ej. Recordatorio: presentación de sociología el viernes"}
            multiline
            textAlignVertical="top"
            className="min-h-[120px] border-0 bg-transparent px-0"
          />
          <Text className="mb-2 mt-3 text-sm font-semibold text-foreground">Materia (opcional)</Text>
          <SubjectPicker subjects={subjects.data ?? []} value={subjectId} onChange={setSubjectId} />
          <ActionButton onPress={() => void submit()} disabled={busy || recorderState.isRecording} className="mt-5">
            {busy ? <ActivityIndicator color="#F7F4EC" /> : <ButtonLabel>Procesar y revisar</ButtonLabel>}
          </ActionButton>
          {status ? <Text className="mt-3 text-center text-sm leading-5 text-primary">{status}</Text> : null}
          <Text className="mt-3 text-center text-xs leading-5 text-muted">UniFlow sugiere tipo, materia, fecha y prioridad. Nada se guarda como tarea hasta que lo confirmes.</Text>
        </Surface>

        <SectionHeader title="Por revisar" className="mt-6" />
        {inbox.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {!inbox.isLoading && !inbox.data?.length ? <Surface className="p-5"><Text className="text-sm leading-5 text-muted">Tu bandeja está vacía. Prueba: “Examen de física el 17 de noviembre, complejidad 4”.</Text></Surface> : null}
        {inbox.data?.map((entry) => {
          const type = typeof entry.suggestion?.type === "string" ? entry.suggestion.type : "note";
          return (
            <Pressable key={entry.id} onPress={() => router.push(`/review/${entry.id}`)}>
              <Surface className="mb-3 flex-row items-center p-4">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{entry.title || "Captura"}</Text>
                  <Text className="mt-1 text-xs text-muted">{kindLabel(type)} sugerido · {formatDateTime(entry.createdAt)}</Text>
                </View>
                <Tag label="Revisar" tone="amber" />
              </Surface>
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
