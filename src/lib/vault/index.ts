export {
  readFile,
  writeFile,
  createFile,
  deleteFile,
  renameFile,
  listFiles,
  searchFiles,
  fileExists,
  ensureVaultDir,
} from "./vault";

export { initializeVault, getDefaultFiles } from "./template";
export { importVaultLite, parseVaultLiteExport } from "./importer";
export { exportVaultToZip, exportAndDownload } from "./exporter";
export {
  buildVaultContext,
  buildFullVaultContext,
  getAutoLoadFiles,
  setAutoLoadFiles,
} from "./injector";
export { parseWritebacks, stripWritebacks, type VaultWriteRequest } from "./writeback";
