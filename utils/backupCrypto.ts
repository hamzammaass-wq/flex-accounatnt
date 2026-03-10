import { BackupPayloadV1 } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 150000;

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptBackupPayload = async (data: unknown, password: string): Promise<BackupPayloadV1> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = encoder.encode(JSON.stringify(data));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const cipherBytes = new Uint8Array(cipherBuffer);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipherText: bytesToBase64(cipherBytes),
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    iterations: ITERATIONS
  };
};

export const decryptBackupPayload = async (payload: BackupPayloadV1, password: string): Promise<unknown> => {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const cipher = base64ToBytes(payload.cipherText);
  const key = await deriveKey(password, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const plainText = decoder.decode(plainBuffer);
  return JSON.parse(plainText);
};

export const isBackupPayloadV1 = (value: unknown): value is BackupPayloadV1 => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as BackupPayloadV1;
  return (
    candidate.version === 1 &&
    candidate.algorithm === 'AES-GCM' &&
    candidate.kdf === 'PBKDF2' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.cipherText === 'string'
  );
};
