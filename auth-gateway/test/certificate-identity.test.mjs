import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCertificateIdentity,
  extractIcpBrasilOtherNamesFromSan,
  isValidCnpj,
  isValidCpf,
  maskCpf,
  parseDistinguishedName,
} from '../src/certificate-identity.mjs';

function der(tag, content) {
  assert.ok(content.length < 128, 'fixture usa somente comprimento DER curto');
  return Buffer.concat([Buffer.from([tag, content.length]), content]);
}

function icpBrasilOtherName(oidLastByte, value) {
  const oid = der(0x06, Buffer.from([0x60, 0x4c, 0x01, 0x03, oidLastByte]));
  const encodedValue = der(0x0c, Buffer.from(value, 'utf8'));
  const explicitValue = der(0xa0, encodedValue);
  return der(0xa0, Buffer.concat([oid, explicitValue]));
}

test('valida e mascara CPF sem persistir o número completo na apresentação', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(maskCpf('52998224725'), '***.***.***-25');
});

test('valida CNPJ', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
});

test('interpreta DN com vírgula escapada', () => {
  const attributes = parseDistinguishedName('CN=SILVA\\, RICARDO:52998224725, O=ICP-Brasil, C=BR');
  assert.equal(attributes.get('CN')[0], 'SILVA, RICARDO:52998224725');
  assert.equal(attributes.get('O')[0], 'ICP-Brasil');
});

test('extrai nome e CPF do commonName como fallback', () => {
  const identity = extractCertificateIdentity({
    subject: 'CN=RICARDO DA SILVA:52998224725\nO=ICP-Brasil\nC=BR',
    issuer: 'CN=AC TESTE ICP-BRASIL\nO=ICP-Brasil',
    raw: Buffer.from('certificado-inválido-apenas-para-fallback'),
    serialNumber: 'AABBCCDDEEFF0011',
    fingerprint256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    validFrom: 'Aug 01 00:00:00 2026 GMT',
    validTo: 'Aug 01 00:00:00 2027 GMT',
  });
  assert.equal(identity.name, 'RICARDO DA SILVA');
  assert.equal(identity.cpf, '52998224725');
  assert.equal(identity.type, 'PF');
  assert.equal(identity.fingerprintLast8, '66778899');
});

test('decodifica o otherName obrigatório da ICP-Brasil no Subject Alternative Name', () => {
  const combined = `01011990${'52998224725'}${'0'.repeat(36)}`;
  const subjectAlternativeName = der(0x30, icpBrasilOtherName(0x01, combined));
  const otherNames = extractIcpBrasilOtherNamesFromSan(subjectAlternativeName);
  assert.equal(otherNames.get('2.16.76.1.3.1'), combined);
});
