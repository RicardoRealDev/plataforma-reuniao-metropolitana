import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedMember {
  segmento: string;
  ente: string;
  representante: string;
  pesoVoto: number;
}

const councils: { name: string; slug: string; members: SeedMember[] }[] = [
  {
    name: 'Região Metropolitana de Palmas',
    slug: 'palmas',
    members: [
      { segmento: 'Estado', ente: 'Estado do Tocantins', representante: 'Representante Estadual', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Palmas', representante: 'Prefeito de Palmas', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Porto Nacional', representante: 'Prefeito de Porto Nacional', pesoVoto: 1 },
      { segmento: 'Município', ente: 'Lajeado', representante: 'Prefeito de Lajeado', pesoVoto: 1 },
      { segmento: 'Sociedade Civil', ente: 'Conselho Regional', representante: 'Representante da Sociedade Civil', pesoVoto: 1 },
    ],
  },
  {
    name: 'Região Metropolitana de Araguaína',
    slug: 'araguaina',
    members: [
      { segmento: 'Estado', ente: 'Estado do Tocantins', representante: 'Representante Estadual', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Araguaína', representante: 'Prefeito de Araguaína', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Babaçulândia', representante: 'Prefeito de Babaçulândia', pesoVoto: 1 },
      { segmento: 'Sociedade Civil', ente: 'Conselho Regional', representante: 'Representante da Sociedade Civil', pesoVoto: 1 },
    ],
  },
  {
    name: 'Região Metropolitana de Gurupi',
    slug: 'gurupi',
    members: [
      { segmento: 'Estado', ente: 'Estado do Tocantins', representante: 'Representante Estadual', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Gurupi', representante: 'Prefeito de Gurupi', pesoVoto: 2 },
      { segmento: 'Município', ente: 'Peixe', representante: 'Prefeito de Peixe', pesoVoto: 1 },
      { segmento: 'Sociedade Civil', ente: 'Conselho Regional', representante: 'Representante da Sociedade Civil', pesoVoto: 1 },
    ],
  },
];

async function main() {
  for (const council of councils) {
    const created = await prisma.council.upsert({
      where: { slug: council.slug },
      update: {},
      create: { name: council.name, slug: council.slug },
    });

    for (const [index, member] of council.members.entries()) {
      const existing = await prisma.member.findFirst({ where: { councilId: created.id, ente: member.ente } });
      if (!existing) {
        await prisma.member.create({ data: { ...member, councilId: created.id, ordem: index } });
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
