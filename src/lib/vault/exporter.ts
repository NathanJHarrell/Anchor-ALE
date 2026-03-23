import JSZip from "jszip";
import { listFiles } from "./vault";

export async function exportVaultToZip(): Promise<Blob> {
  const files = await listFiles();
  const zip = new JSZip();
  const vaultFolder = zip.folder("vault");

  if (!vaultFolder) {
    throw new Error("Failed to create vault folder in zip");
  }

  for (const file of files) {
    vaultFolder.file(file.path, file.content);
  }

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAndDownload(): Promise<void> {
  const blob = await exportVaultToZip();
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `anchor-vault-${timestamp}.zip`);
}
