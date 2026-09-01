import { Hono } from "jsr:@hono/hono@4";
import { sql } from "../../_shared/db.ts";
import type { Council, Member, Meeting } from "../../_shared/types.ts";

export function registerCouncilRoutes(app: Hono) {
  app.get("/councils", async (c) => {
    const councils = await sql<Council[]>`select * from "Council" order by name`;
    const members = await sql<Member[]>`select * from "Member" order by "councilId", "ordem" asc`;

    const byCouncil = new Map<string, Member[]>();
    for (const member of members) {
      const arr = byCouncil.get(member.councilId) ?? [];
      arr.push(member);
      byCouncil.set(member.councilId, arr);
    }

    return c.json(councils.map((council) => ({ ...council, members: byCouncil.get(council.id) ?? [] })));
  });

  app.get("/councils/:id/meetings", async (c) => {
    const id = c.req.param("id");
    const meetings = await sql<Meeting[]>`
      select * from "Meeting" where "councilId" = ${id} order by "createdAt" desc
    `;
    return c.json(meetings);
  });
}
