const encoder = new TextEncoder();
const ITERATIONS = 310_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const pairs = value.match(/.{2}/g) ?? [];
  const bytes = new Uint8Array(pairs.length);
  pairs.forEach((byte, index) => { bytes[index] = Number.parseInt(byte, 16); });
  return bytes;
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
}

export function randomSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivePasswordHash(password: string, salt: string, iterations = ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, salt: string, expectedHex: string, iterations: number): Promise<boolean> {
  const actual = fromHex(await derivePasswordHash(password, salt, iterations));
  const expected = fromHex(expectedHex);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export const passwordIterations = ITERATIONS;
