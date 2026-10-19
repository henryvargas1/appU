import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { apiCall } from "@/lib/_core/api";

export type UploadKind = "photo" | "audio" | "document";

function guessType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function readAsBase64(uri: string) {
  if (Platform.OS !== "web") return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(blob);
  });
}

/** Sube un archivo del dispositivo al almacenamiento en la nube; el teléfono no conserva copias. */
export async function uploadDeviceFile(uri: string, kind: UploadKind, filename?: string, contentType?: string) {
  const safeName = filename || uri.split("/").pop() || `captura-${Date.now()}`;
  const data = await readAsBase64(uri);
  return apiCall<{ key: string; url: string; attachmentId: number }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: safeName, contentType: contentType || guessType(safeName), data, kind }),
  });
}
