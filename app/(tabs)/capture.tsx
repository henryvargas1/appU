import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton, SectionHeader, Surface, Tag } from "@/components/uni-flow";
import { trpc } from "@/lib/trpc";
import { processUploadedAsset, transcribeUploadedAudio, uploadDeviceFile } from "@/lib/upload";

const modes = [
  { key: "text" as const, label: "Texto", icon: "Aa" },
  { key: "photo" as const, label: "Foto", icon: "▧" },
  { key: "audio" as const, label: "Audio", icon: "◉" },
  { key: "document" as const, label: "Archivo", icon: "□" },
];

type CaptureKind = "text" | "photo" | "audio" | "document";

export default function CaptureScreen() {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const utils = trpc.useUtils();
  const subjects = trpc.subject.list.useQuery();
  const [kind, setKind] = useState<CaptureKind>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dueText, setDueText] = useState("");
  const [complexity, setComplexity] = useState(2);
  const [asTask, setAsTask] = useState(true);
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [sourceUrl, setSourceUrl] = useState<string | undefined>();
  const [sourceName, setSourceName] = useState<string | undefined>();
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const capture = trpc.capture.create.useMutation({ onSuccess: () => { void utils.task.list.invalidate(); void utils.planner.snapshot.invalidate(); void utils.planner.reminders.invalidate(); void utils.subject.list.invalidate(); setTitle(""); setContent(""); setDueText(""); setSourceUrl(undefined); setSourceName(undefined); setMimeType(undefined); setStatus("Guardado. UniFlow ya puede organizar este material."); } });

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setStatus("Necesitamos permiso para seleccionar una foto."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) { setKind("photo"); setSourceUrl(result.assets[0].uri); setSourceName(result.assets[0].fileName || result.assets[0].uri.split("/").pop() || "class-photo.jpg"); setMimeType("image/jpeg"); setTitle(title || "Foto de clase"); setStatus("Foto lista. Al guardar, se subirá y se leerá en la nube."); }
  };

  const chooseDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
    if (!result.canceled && result.assets[0]) { setKind("document"); setSourceUrl(result.assets[0].uri); setSourceName(result.assets[0].name); setMimeType(result.assets[0].mimeType); setTitle(title || result.assets[0].name); setStatus("Archivo listo. Al guardar, se subirá y se leerá en la nube."); }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await recorder.stop();
      setIsRecording(false);
      if (recorder.uri) { setKind("audio"); setSourceUrl(recorder.uri); setSourceName("class-audio.m4a"); setMimeType("audio/mp4"); setTitle(title || "Audio de clase"); setStatus("Audio listo. Al guardar, se transcribirá en la nube."); }
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) { setStatus("Necesitamos permiso para usar el micrófono."); return; }
    await recorder.prepareToRecordAsync();
    recorder.record();
    setKind("audio");
    setIsRecording(true);
    setStatus("Grabando… toca Audio otra vez para detener.");
  };

  const submit = async () => {
    if (!title.trim() && !content.trim() && !sourceUrl) { setStatus("Escribe algo o selecciona un archivo para capturar."); return; }
    const parsedDue = dueText.trim() ? new Date(`${dueText.trim()}T09:00:00`) : undefined;
    try {
      setStatus(sourceUrl?.startsWith("file:") || sourceUrl?.startsWith("content:") ? "Subiendo y leyendo el archivo..." : "Guardando en UniFlow...");
      let remoteUrl = sourceUrl;
      let extractedContent = content.trim();
      if (sourceUrl && (sourceUrl.startsWith("file:") || sourceUrl.startsWith("content:"))) {
        const uploaded = await uploadDeviceFile(sourceUrl, sourceName, mimeType);
        remoteUrl = uploaded.url;
        if (kind === "photo" || kind === "document") {
          const extracted = await processUploadedAsset(uploaded.key, kind, mimeType);
          if (!extractedContent) extractedContent = extracted.text;
        } else if (kind === "audio") {
          const transcript = await transcribeUploadedAudio(uploaded.key, sourceName, mimeType);
          if (!extractedContent) extractedContent = transcript.text;
        }
      }
      capture.mutate({ kind, title: title.trim() || undefined, content: extractedContent || undefined, sourceUrl: remoteUrl, subjectId, asTask: asTask && (kind === "text" || kind === "audio"), dueAt: parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : undefined, complexity, estimatedMinutes: complexity * 15 });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible subir el archivo.");
    }
  };

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm font-semibold uppercase tracking-[2px] text-primary">Bandeja de entrada</Text>
        <Text className="mt-2 text-4xl font-bold tracking-tight text-foreground">Capturar</Text>
        <Text className="mt-2 text-base leading-6 text-muted">Escribe rápido ahora; después lo convertimos en un plan claro.</Text>
        <View className="mt-6 flex-row gap-2">{modes.map((mode) => <Pressable key={mode.key} onPress={() => { setKind(mode.key); if (mode.key === "photo") void choosePhoto(); if (mode.key === "document") void chooseDocument(); if (mode.key === "audio") void toggleRecording(); }} className={`flex-1 items-center rounded-2xl border px-2 py-3 ${kind === mode.key ? "border-primary bg-[#E1EEE5]" : "border-border bg-surface"}`}><Text className="text-lg font-bold text-primary">{mode.key === "audio" && isRecording ? "■" : mode.icon}</Text><Text className="mt-1 text-xs font-semibold text-foreground">{mode.key === "audio" && isRecording ? "Detener" : mode.label}</Text></Pressable>)}</View>

        <Surface className="mt-5 p-5">
          <TextInput value={title} onChangeText={setTitle} placeholder="Título breve (ej. Parcial de cálculo)" placeholderTextColor="#718078" className="border-b border-border pb-3 text-base font-semibold text-foreground" />
          <TextInput value={content} onChangeText={setContent} placeholder={kind === "audio" ? "Aquí aparecerá la transcripción del audio..." : "¿Qué necesitas recordar o guardar?"} placeholderTextColor="#718078" multiline textAlignVertical="top" className="mt-4 min-h-[130px] text-base leading-6 text-foreground" />
          {sourceUrl ? <View className="mb-3 rounded-xl bg-background px-3 py-2"><Text className="text-xs text-muted" numberOfLines={1}>Adjunto seleccionado: {sourceName || sourceUrl.split("/").pop()}</Text></View> : null}
          <View className="mt-3 flex-row flex-wrap gap-2">{subjects.data?.map((subject) => <Pressable key={subject.id} onPress={() => setSubjectId(subject.id)}><Tag label={subject.name} tone={subjectId === subject.id ? "sage" : "neutral"} /></Pressable>)}</View>
          {asTask ? <><Text className="mt-5 text-sm font-semibold text-foreground">Fecha límite (AAAA-MM-DD)</Text><TextInput value={dueText} onChangeText={setDueText} placeholder="Ej. 2026-11-17" placeholderTextColor="#718078" keyboardType="numbers-and-punctuation" className="mt-2 rounded-xl border border-border bg-background px-3 py-3 text-foreground" /><Text className="mt-4 text-sm font-semibold text-foreground">Complejidad</Text><View className="mt-2 flex-row gap-2">{[1, 2, 3, 4, 5].map((level) => <Pressable key={level} onPress={() => setComplexity(level)} className={`h-9 w-9 items-center justify-center rounded-full ${complexity === level ? "bg-primary" : "bg-background"}`}><Text className={`font-bold ${complexity === level ? "text-background" : "text-muted"}`}>{level}</Text></Pressable>)}</View><Text className="mt-2 text-xs leading-5 text-muted">La complejidad define la prioridad, el tiempo recomendado y la cantidad de recordatorios.</Text></> : null}
          <Pressable onPress={() => setAsTask(!asTask)} className="mt-5 flex-row items-center"><View className={`mr-2 h-5 w-5 items-center justify-center rounded-md border ${asTask ? "border-primary bg-primary" : "border-border bg-background"}`}>{asTask ? <Text className="text-xs font-bold text-background">✓</Text> : null}</View><Text className="text-sm text-foreground">Convertir en tarea y agendar recordatorios</Text></Pressable>
          <ActionButton onPress={submit} disabled={capture.isPending || isRecording} className="mt-5 items-center">{capture.isPending ? <ActivityIndicator color="#F7F4EC" /> : <Text className="font-semibold text-background">Guardar en UniFlow</Text>}</ActionButton>
          {status ? <Text className="mt-3 text-center text-sm leading-5 text-primary">{status}</Text> : null}
        </Surface>
        <SectionHeader title="Ideas rápidas" />
        <Surface className="p-5"><Text className="text-sm leading-6 text-muted">Prueba: “Examen de física el 17 de noviembre, complejidad 4” o “Recordatorio: terminar la introducción del ensayo”.</Text></Surface>
      </ScrollView>
    </ScreenContainer>
  );
}
