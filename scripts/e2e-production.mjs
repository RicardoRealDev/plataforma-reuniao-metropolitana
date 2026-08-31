const baseUrl = process.env.API_URL;

if (!baseUrl) {
  throw new Error('Defina API_URL com a URL da Edge Function api.');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} retornou ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const post = (path, body = {}) =>
  request(path, { method: 'POST', body: JSON.stringify(body) });

const councils = await request('/councils');
const council = councils.find(({ slug }) => slug === 'palmas');
if (!council) throw new Error('Conselho de Palmas não encontrado.');

const meeting = await post('/meetings', {
  councilId: council.id,
  titulo: `Teste E2E Produção ${new Date().toISOString()}`,
});
console.log(`Reunião criada: ${meeting.id}`);

const started = await post(`/meetings/${meeting.id}/start`);
console.log(`Reunião iniciada: ${started.status}`);

const presentMembers = council.members.slice(0, 3);
for (const member of presentMembers) {
  await post(`/meetings/${meeting.id}/attendance`, {
    memberId: member.id,
    status: 'PRESENT',
  });
}
console.log(`Presenças manuais registradas: ${presentMembers.length}`);

const agenda = await post(`/meetings/${meeting.id}/agenda`, {
  titulo: 'Regimento Interno',
  ordem: 1,
});
const snapshot = await post(`/agenda/${agenda.id}/open`);
await post(`/agenda/${agenda.id}/bulk-favorable`);
const result = await request(`/agenda/${agenda.id}/result`);
await post(`/agenda/${agenda.id}/close`);

const dashboard = await request(`/meetings/${meeting.id}/dashboard`);
const closed = await post(`/meetings/${meeting.id}/close`);
const minutes = await request(`/meetings/${meeting.id}/minutes`);

const summary = {
  meetingId: meeting.id,
  meetingStatus: closed.meeting.status,
  aptos: snapshot.aptos,
  ausentes: snapshot.ausentes,
  pesoTotalAptos: result.pesoTotalAptos,
  pesoTotalEnte: result.pesoTotalEnte,
  quorumAtingido: result.quorumAtingido,
  dashboardPresentes: dashboard.resumo.presentes,
  ataGerada: Boolean(minutes.texto?.trim()),
};

console.log(JSON.stringify(summary, null, 2));

if (
  summary.meetingStatus !== 'CLOSED' ||
  summary.aptos !== presentMembers.length ||
  !summary.ataGerada
) {
  throw new Error('O fluxo E2E terminou com resultado inesperado.');
}
