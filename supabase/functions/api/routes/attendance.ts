import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { recordAttendance, getCurrentAttendance } from "../../_shared/domain/attendance.ts";
import { scheduleSheetSync } from "../../_shared/sheets/client.ts";
import type { Meeting, Member } from "../../_shared/types.ts";
import { isAuthResponse, requireAuth } from "../../_shared/auth.ts";

const manualAttendanceSchema = z.object({
  memberId: z.string(),
  status: z.enum(["PRESENT", "ABSENT"]),
});

export function registerAttendanceRoutes(app: Hono) {
  app.post("/meetings/:id/attendance", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    const { memberId, status } = manualAttendanceSchema.parse(await c.req.json());

    await recordAttendance(id, memberId, "MANUAL", status);
    await scheduleSheetSync(id);

    return c.json({ ok: true }, 201);
  });

  app.get("/meetings/:id/attendance", async (c) => {
    const id = c.req.param("id");
    const [meeting] = await sql<Meeting[]>`select * from "Meeting" where id = ${id}`;
    if (!meeting) throw new Error(`Meeting ${id} não encontrado`);

    const members = await sql<Member[]>`
      select * from "Member" where "councilId" = ${meeting.councilId} order by "ordem" asc
    `;
    const attendance = await getCurrentAttendance(id);

    return c.json(
      members.map((member) => ({
        member,
        attendance: attendance.get(member.id) ?? { present: false, manualStatus: null, cameraStatus: null },
      })),
    );
  });
}
