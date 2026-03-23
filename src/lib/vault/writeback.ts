export interface VaultWriteRequest {
  filename: string;
  content: string;
}

const WRITE_PATTERN = /\[VAULT_WRITE:\s*([^\]]+)\]([\s\S]*?)\[\/VAULT_WRITE\]/g;

export function parseWritebacks(response: string): VaultWriteRequest[] {
  const requests: VaultWriteRequest[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex since we reuse the regex
  WRITE_PATTERN.lastIndex = 0;

  while ((match = WRITE_PATTERN.exec(response)) !== null) {
    const filename = match[1]!.trim();
    const content = match[2]!.trim();
    if (filename && content) {
      requests.push({ filename, content });
    }
  }

  return requests;
}

export function stripWritebacks(response: string): string {
  return response.replace(WRITE_PATTERN, "").trim();
}
