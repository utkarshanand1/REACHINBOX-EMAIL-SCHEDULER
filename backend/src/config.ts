import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string(),
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  DEFAULT_MIN_DELAY_SECONDS: z.string().default('2'),
  DEFAULT_HOURLY_LIMIT: z.string().default('200'),
  WORKER_CONCURRENCY: z.string().default('5'),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string(),
  SESSION_SECRET: z.string(),
  FRONTEND_URL: z.string().default('http://localhost:5173')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: Number(env.PORT),
  redisUrl: env.REDIS_URL,
  databaseUrl: env.DATABASE_URL,
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  },
  defaults: {
    minDelaySeconds: Number(env.DEFAULT_MIN_DELAY_SECONDS),
    hourlyLimit: Number(env.DEFAULT_HOURLY_LIMIT)
  },
  worker: {
    concurrency: Number(env.WORKER_CONCURRENCY)
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL
  },
  sessionSecret: env.SESSION_SECRET,
  frontendUrl: env.FRONTEND_URL
};
