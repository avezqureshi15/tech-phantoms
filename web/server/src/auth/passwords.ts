import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const MAX_MEMORY = 64 * 1024 * 1024;
const KEY_BYTES = 64;
const SALT_BYTES = 32;
export const MIN_PASSWORD_LENGTH = 12;

/** A calibrated common-password blocklist. Length beats composition rules. */
const COMMON_PASSWORDS = new Set([
  "123456789012", "password1234", "password12345", "password123456", "qwertyuiop12",
  "qwerty123456", "letmein12345", "welcome12345", "admin1234567", "iloveyou1234",
  "monkey123456", "dragon123456", "football1234", "baseball1234", "sunshine1234",
  "princess1234", "superman1234", "trustno12345", "abc123456789", "passwordpassword",
  "1234567890ab", "1q2w3e4r5t6y", "123qweasdzxc", "zaq12wsxcde3", "qazwsxedcrfv",
  "passw0rd1234", "p@ssw0rd1234", "changeme1234", "welcomewelcome", "letmeinletmein",
  "qwertyqwerty", "iloveyouilove", "adminadmin12", "root12345678", "toor12345678",
  "testing12345", "test12345678", "demo12345678", "guest1234567", "master123456",
  "shadow123456", "michael12345", "jennifer1234", "computer1234", "internet1234",
  "samsung12345", "google123456", "facebook1234", "instagram123", "linkedin1234",
  "whatsapp1234", "telegram1234", "snapchat1234", "tiktok123456", "youtube12345",
  "diya12345678", "festivemart12", "festive12345", "diwalidiwali", "happy Diwali1",
  "india1234567", "bharat123456", "namaste12345", "dhanyavaad12", "krishna12345",
  "ganesh123456", "lakshmi12345", "saraswati123", "hanuman12345", "shivshakti12",
  "1234567890a", "a1234567890", "abcdefghijkl", "abcdef123456", "abcd12345678",
  "asdfghjkl123", "zxcvbnm12345", "poiuytrewq12", "mnbvcxzlkjh", "qazwsx123456",
  "1qaz2wsx3edc", "1q2w3e4r5t6y7u", "qwertyuiopas", "password123!", "welcome123!",
  "admin123!", "letmein123!", "changeme123!", "trustno1!", "sunshine123!",
  "iloveyou123!", "princess123!", "football123!", "baseball123!", "superman123!",
  "qwerty123!", "abc123!", "passw0rd!", "p@ssword123!", "diya@12345678",
  "festivemart@1", "diya@festive1", "operator1234", "operator12345",
  "tenantadmin12", "superadmin12", "superadmin123", "administrator1",
]);

export function validatePassword(password: unknown, email: string): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 256) return "Password is too long.";
  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) return "Choose a less common password.";
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  if (localPart.length >= 3 && normalized.includes(localPart)) {
    return "Password must not contain your email address.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(keyRaw, "base64");
  try {
    const candidate = await scryptAsync(password, salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: MAX_MEMORY,
    });
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/** Always hash against a real stored hash so missing accounts do not return faster. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("b9f4c8e2d7a1-not-a-real-password");
  await verifyPassword(password, await dummyHashPromise);
}
