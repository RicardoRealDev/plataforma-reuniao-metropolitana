import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string(),
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  PORT: z.coerce.number().default(4000),
  ADMIN_SEED_TOKEN: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),
  SHEETS_SYNC_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SHEETS_SHARE_WITH_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

export const env = schema.parse(process.env);
