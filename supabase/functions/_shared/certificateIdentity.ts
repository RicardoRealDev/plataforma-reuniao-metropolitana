import { hashToken } from "./auth.ts";

export type CertificateType = "PF" | "PJ" | "UNKNOWN";

export function digitsOnly(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

export function documentLast2(cpf: string | null, cnpj: string | null): string | null {
  const document = digitsOnly(cpf || cnpj);
  return document.length >= 2 ? document.slice(-2) : null;
}

export function maskedDocument(type: CertificateType, last2: string | null): string | null {
  if (!last2) return null;
  return type === "PJ" ? `**.***.***/****-${last2}` : `***.***.***-${last2}`;
}

export async function hashCpf(cpf: string | null | undefined): Promise<string | null> {
  const digits = digitsOnly(cpf);
  return digits.length === 11 ? hashToken(`CPF:${digits}`) : null;
}

