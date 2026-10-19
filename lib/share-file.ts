import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Guarda un archivo temporal y abre la hoja de compartir. En iPhone, "Guardar en Archivos"
 * permite dejar la copia en iCloud Drive sin almacenarla dentro de UniFlow.
 */
export async function shareTextFile(filename: string, mimeType: string, content: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Share.share(Platform.OS === "ios" ? { url: path } : { message: content, title: filename });
}
