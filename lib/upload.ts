import * as FileSystem from "expo-file-system/legacy";
import { apiCall } from "@/lib/_core/api";

function guessType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function uploadDeviceFile(uri: string, filename?: string, contentType?: string) {
  const safeName = filename || uri.split("/").pop() || `capture-${Date.now()}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return apiCall<{ key: string; url: string }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: safeName, contentType: contentType || guessType(safeName), data: base64 }),
  });
}

export async function processUploadedAsset(key: string, kind: "photo" | "document", mimeType?: string) {
  return apiCall<{ text: string }>("/api/process-asset", {
    method: "POST",
    body: JSON.stringify({ key, kind, mimeType: mimeType || "application/octet-stream" }),
  });
}


export async function transcribeUploadedAudio(key: string, filename?: string, mimeType?: string) {
  return apiCall<{ text: string }>("/api/transcribe", {
    method: "POST",
    body: JSON.stringify({ key, filename, mimeType }),
  });
}
