import { sql } from "../db.ts";

interface SeedMember {
  segmento: string;
  ente: string;
  representante: string;
  pesoVoto: number;
}

export const councils: { name: string; slug: string; members: SeedMember[] }[] = [
  {
    name: "Região Metropolitana de Palmas",
    slug: "palmas",
    members: [
      { segmento: "Estado", ente: "Estado do Tocantins", representante: "Representante Estadual", pesoVoto: 2 },
      { segmento: "Município", ente: "Palmas", representante: "Prefeito de Palmas", pesoVoto: 2 },
      { segmento: "Município", ente: "Porto Nacional", representante: "Prefeito de Porto Nacional", pesoVoto: 1 },
      { segmento: "Município", ente: "Lajeado", representante: "Prefeito de Lajeado", pesoVoto: 1 },
      { segmento: "Sociedade Civil", ente: "Conselho Regional", representante: "Representante da Sociedade Civil", pesoVoto: 1 },
    ],
  },
  {
    name: "Região Metropolitana de Araguaína",
    slug: "araguaina",
    members: [
      { segmento: "Estado", ente: "Estado do Tocantins", representante: "Representante Estadual", pesoVoto: 2 },
      { segmento: "Município", ente: "Araguaína", representante: "Prefeito de Araguaína", pesoVoto: 2 },
      { segmento: "Município", ente: "Babaçulândia", representante: "Prefeito de Babaçulândia", pesoVoto: 1 },
      { segmento: "Sociedade Civil", ente: "Conselho Regional", representante: "Representante da Sociedade Civil", pesoVoto: 1 },
    ],
  },
  {
    name: "Região Metropolitana de Gurupi",
    slug: "gurupi",
    members: [
      { segmento: "Estado", ente: "Estado do Tocantins", representante: "Representante Estadual", pesoVoto: 2 },
      { segmento: "Município", ente: "Gurupi", representante: "Prefeito de Gurupi", pesoVoto: 2 },
      { segmento: "Município", ente: "Peixe", representante: "Prefeito de Peixe", pesoVoto: 1 },
      { segmento: "Sociedade Civil", ente: "Conselho Regional", representante: "Representante da Sociedade Civil", pesoVoto: 1 },
    ],
  },
];

export async function seedCouncils(): Promise<void> {
  for (const council of councils) {
    const [existing] = await sql<{ id: string }[]>`select id from "Council" where slug = ${council.slug}`;
    const councilId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await sql`insert into "Council" (id, name, slug) values (${councilId}, ${council.name}, ${council.slug})`;
    }

    for (const [index, member] of council.members.entries()) {
      const [existingMember] = await sql<{ id: string }[]>`
        select id from "Member" where "councilId" = ${councilId} and ente = ${member.ente}
      `;
      if (!existingMember) {
        await sql`
          insert into "Member" (id, "councilId", segmento, ente, representante, "pesoVoto", ordem)
          values (${crypto.randomUUID()}, ${councilId}, ${member.segmento}, ${member.ente}, ${member.representante}, ${member.pesoVoto}, ${index})
        `;
      }
    }
  }
}
