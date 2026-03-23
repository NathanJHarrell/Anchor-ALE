import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

export interface ImageData {
  data: string;
  media_type: string;
  preview: string;
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function inferMediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return map[ext] ?? "image/jpeg";
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Open native file picker filtered to images. */
export async function pickImage(): Promise<ImageData | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  });

  if (!selected) return null;

  return readImageAsBase64(selected);
}

/** Read a file from disk and convert to base64 ImageData. */
export async function readImageAsBase64(path: string): Promise<ImageData> {
  const bytes = await readFile(path);
  const media_type = inferMediaType(path);
  let data = uint8ToBase64(bytes);

  if (bytes.length > MAX_BYTES) {
    data = await resizeIfNeeded(data, media_type, MAX_BYTES);
  }

  const preview = `data:${media_type};base64,${data}`;
  return { data, media_type, preview };
}

/** Compress image via canvas if it exceeds maxBytes. */
export async function resizeIfNeeded(
  base64: string,
  mediaType: string,
  maxBytes: number = MAX_BYTES,
): Promise<string> {
  const byteLength = Math.ceil(base64.length * 0.75);
  if (byteLength <= maxBytes) return base64;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.sqrt(maxBytes / byteLength);
      const width = Math.round(img.width * ratio);
      const height = Math.round(img.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const outputType = mediaType === "image/png" ? "image/png" : "image/jpeg";
      const quality = outputType === "image/jpeg" ? 0.8 : undefined;
      const dataUrl = canvas.toDataURL(outputType, quality);
      const compressed = dataUrl.split(",")[1] ?? base64;
      resolve(compressed);
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = `data:${mediaType};base64,${base64}`;
  });
}

export { MAX_IMAGES };
