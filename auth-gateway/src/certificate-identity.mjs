import { AsnParser } from '@peculiar/asn1-schema';
import { Certificate, SubjectAlternativeName, id_ce_subjectAltName } from '@peculiar/asn1-x509';
import * as asn1js from 'asn1js';

const OIDS = {
  PF_DATA: '2.16.76.1.3.1',
  PJ_RESPONSIBLE_NAME: '2.16.76.1.3.2',
  PJ_CNPJ: '2.16.76.1.3.3',
  PJ_RESPONSIBLE_DATA: '2.16.76.1.3.4',
  PJ_LEGAL_NAME: '2.16.76.1.3.8',
};

function onlyDigits(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let digit = 9; digit < 11; digit += 1) {
    let sum = 0;
    for (let index = 0; index < digit; index += 1) sum += Number(cpf[index]) * (digit + 1 - index);
    const verifier = ((sum * 10) % 11) % 10;
    if (verifier !== Number(cpf[digit])) return false;
  }
  return true;
}

export function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * factor;
      factor = factor === 2 ? 9 : factor - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

export function maskCpf(value) {
  const cpf = onlyDigits(value);
  return cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : null;
}

export function maskCnpj(value) {
  const cnpj = onlyDigits(value);
  return cnpj.length === 14 ? `**.***.***/****-${cnpj.slice(-2)}` : null;
}

function decodeEscapedDnValue(value) {
  return value
    .replace(/\\([,=+<>#;\\"])/g, '$1')
    .replace(/\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .trim();
}

export function parseDistinguishedName(dn) {
  const attributes = new Map();
  let current = '';
  let escaped = false;
  const parts = [];
  for (const character of String(dn ?? '')) {
    if (escaped) {
      current += `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '\n' || character === '\r' || character === ',') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (escaped) current += '\\';
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim().toUpperCase();
    const value = decodeEscapedDnValue(part.slice(separator + 1));
    if (!attributes.has(key)) attributes.set(key, []);
    attributes.get(key).push(value);
  }
  return attributes;
}

function decodeOtherNameValue(buffer) {
  const parsed = asn1js.fromBER(buffer);
  if (parsed.offset === -1) return null;

  const read = (node) => {
    const direct = node?.valueBlock?.value;
    if (typeof direct === 'string') return direct.trim();
    const children = node?.valueBlock?.value;
    if (Array.isArray(children)) {
      for (const child of children) {
        const value = read(child);
        if (value) return value;
      }
    }
    const bytes = node?.valueBlock?.valueHexView;
    if (bytes?.byteLength) {
      const nested = asn1js.fromBER(bytes);
      if (nested.offset !== -1 && nested.offset === bytes.byteLength) {
        const value = read(nested.result);
        if (value) return value;
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
      if (text) return text;
    }
    return null;
  };

  return read(parsed.result);
}

export function extractIcpBrasilOtherNamesFromSan(rawSubjectAlternativeName) {
  const names = AsnParser.parse(rawSubjectAlternativeName, SubjectAlternativeName);
  const result = new Map();
  for (const name of names) {
    if (!name.otherName?.typeId) continue;
    const value = decodeOtherNameValue(name.otherName.value);
    if (value) result.set(name.otherName.typeId, value);
  }
  return result;
}

export function extractIcpBrasilOtherNames(rawCertificate) {
  try {
    const parsed = AsnParser.parse(rawCertificate, Certificate);
    const extension = parsed.tbsCertificate.extensions?.find((item) => item.extnID === id_ce_subjectAltName);
    if (!extension) return new Map();
    return extractIcpBrasilOtherNamesFromSan(extension.extnValue);
  } catch {
    return new Map();
  }
}

function stripDocumentSuffix(commonName) {
  return String(commonName ?? '')
    .replace(/\s*:\s*\d{11,14}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function documentFromCommonName(commonName, length, validator) {
  const match = String(commonName ?? '').match(/:\s*(\d{11,14})\s*$/);
  if (!match || match[1].length !== length || !validator(match[1])) return null;
  return match[1];
}

function cpfFromCombinedField(value) {
  const digits = onlyDigits(value);
  const cpf = digits.length >= 19 ? digits.slice(8, 19) : '';
  return isValidCpf(cpf) ? cpf : null;
}

export function extractCertificateIdentity(certificate) {
  const subject = parseDistinguishedName(certificate.subject);
  const issuer = parseDistinguishedName(certificate.issuer);
  const commonName = subject.get('CN')?.[0] ?? '';
  const otherNames = extractIcpBrasilOtherNames(certificate.raw);
  const pfCpf = cpfFromCombinedField(otherNames.get(OIDS.PF_DATA));
  const pjCpf = cpfFromCombinedField(otherNames.get(OIDS.PJ_RESPONSIBLE_DATA));
  const cnpjFromSan = onlyDigits(otherNames.get(OIDS.PJ_CNPJ));
  const cnpj = isValidCnpj(cnpjFromSan)
    ? cnpjFromSan
    : documentFromCommonName(commonName, 14, isValidCnpj);
  const cpf = pfCpf
    ?? pjCpf
    ?? documentFromCommonName(commonName, 11, isValidCpf);
  const legalEntityName = otherNames.get(OIDS.PJ_LEGAL_NAME)?.trim() || null;
  const responsibleName = otherNames.get(OIDS.PJ_RESPONSIBLE_NAME)?.trim() || null;
  const name = stripDocumentSuffix(responsibleName || commonName || legalEntityName);
  const issuerName = issuer.get('CN')?.[0] ?? issuer.get('O')?.[0] ?? certificate.issuer;
  const type = cnpj ? 'PJ' : cpf ? 'PF' : 'UNKNOWN';

  if (!name) throw new Error('identidade_nao_encontrada');
  return {
    type,
    name,
    cpf,
    cpfMasked: maskCpf(cpf),
    cnpj,
    cnpjMasked: maskCnpj(cnpj),
    legalEntityName,
    issuerName,
    serialLast8: String(certificate.serialNumber ?? '').slice(-8).toUpperCase(),
    fingerprint: certificate.fingerprint256.replaceAll(':', '').toUpperCase(),
    fingerprintLast8: certificate.fingerprint256.replaceAll(':', '').slice(-8).toUpperCase(),
    validFrom: new Date(certificate.validFrom).toISOString(),
    validTo: new Date(certificate.validTo).toISOString(),
  };
}

export function publicCertificateIdentity(identity) {
  return {
    type: identity.type,
    name: identity.name,
    cpfMasked: identity.cpfMasked,
    cnpjMasked: identity.cnpjMasked,
    legalEntityName: identity.legalEntityName,
    issuerName: identity.issuerName,
    fingerprintLast8: identity.fingerprintLast8,
    validFrom: identity.validFrom,
    validTo: identity.validTo,
  };
}
