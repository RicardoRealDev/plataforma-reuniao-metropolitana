import { assertEquals } from "jsr:@std/assert@1";
import { derivePasswordHash, normalizeEmail, randomSalt, verifyPassword } from "./password.ts";

Deno.test("normalizeEmail remove espaços e normaliza maiúsculas", () => {
  assertEquals(normalizeEmail("  Pessoa@Exemplo.COM  "), "pessoa@exemplo.com");
});

Deno.test("hash de senha valida somente a senha correta", async () => {
  const salt = randomSalt();
  const hash = await derivePasswordHash("Senha-Forte-123!", salt, 10_000);
  assertEquals(await verifyPassword("Senha-Forte-123!", salt, hash, 10_000), true);
  assertEquals(await verifyPassword("Senha-Incorreta-123!", salt, hash, 10_000), false);
});
