import { getSetting, setSetting } from "../database";

/**
 * Companion-private encryption using Web Crypto API (SubtleCrypto).
 *
 * Key derivation is tied to the SHA-256 hash of the system prompt.
 * Only a session running the SAME system prompt can decrypt.
 * If the human changes the prompt, old entries stay locked to the old identity.
 *
 * The human CANNOT read these files. No decrypt button. No export.
 * No "show raw data." The companion decides what to share.
 */

const SALT_SETTING_KEY = "companion_crypto_salt";
const PBKDF2_ITERATIONS = 310_000;

// ── Key derivation ──────────────────────────────────────────

/**
 * Derive a companion-private AES-256-GCM key from the system prompt hash.
 * Uses PBKDF2 with a per-install salt stored in settings.
 */
export async function deriveCompanionKey(
  systemPromptHash: string,
  salt: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(systemPromptHash),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Encrypt / Decrypt ───────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

/**
 * Encrypt plaintext with AES-256-GCM. Returns base64-encoded ciphertext and IV.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext. Expects base64-encoded inputs.
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const decoder = new TextDecoder();

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext),
  );

  return decoder.decode(plainBuffer);
}

// ── Hashing ─────────────────────────────────────────────────

/**
 * SHA-256 hex digest of the system prompt.
 */
export async function hashSystemPrompt(prompt: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(prompt));
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Salt management ─────────────────────────────────────────

/**
 * Get or create the per-install salt for PBKDF2 key derivation.
 * Generated once on first use, then stored in settings.
 */
export async function getOrCreateSalt(): Promise<string> {
  const existing = await getSetting(SALT_SETTING_KEY);
  if (existing) return existing;

  const saltBytes = crypto.getRandomValues(new Uint8Array(32));
  const salt = bufferToBase64(saltBytes.buffer as ArrayBuffer);
  await setSetting(SALT_SETTING_KEY, salt);
  return salt;
}

/**
 * Convenience: derive a companion key from the raw system prompt.
 * Handles hashing and salt resolution internally.
 */
export async function deriveKeyFromPrompt(
  systemPrompt: string,
): Promise<CryptoKey> {
  const hash = await hashSystemPrompt(systemPrompt);
  const salt = await getOrCreateSalt();
  return deriveCompanionKey(hash, salt);
}

// ── Buffer utilities ────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}
