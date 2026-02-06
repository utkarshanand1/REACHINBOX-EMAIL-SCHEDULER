import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { z } from 'zod';
import { config } from './config';
import { prisma } from './db';
import { emailQueue } from './queue';
import passport, { AuthUser } from './auth';

const app = express();
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (_req, res) => {
    res.redirect(`${config.frontendUrl}/`);
  }
);

app.get('/auth/me', (req, res) => {
  const user = req.user as AuthUser | undefined;
  if (!user) return res.status(401).json({ user: null });
  res.json({ user });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

const scheduleSchema = z.object({
  senderEmail: z.string().email(),
  senderName: z.string().optional(),
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  sendAt: z.string().datetime(),
  minDelaySeconds: z.number().int().positive().optional(),
  hourlyLimit: z.number().int().positive().optional()
});

app.post('/api/emails/schedule', async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const data = parsed.data;
  const scheduledAt = new Date(data.sendAt);
  const minDelaySeconds = data.minDelaySeconds ?? config.defaults.minDelaySeconds;
  const hourlyLimit = data.hourlyLimit ?? config.defaults.hourlyLimit;

  const createdJobs = await prisma.$transaction(async (tx) => {
    const created = [] as { id: string }[];

    for (const recipient of data.recipients) {
      const emailJob = await tx.emailJob.create({
        data: {
          senderEmail: data.senderEmail,
          senderName: data.senderName,
          recipientEmail: recipient,
          subject: data.subject,
          body: data.body,
          scheduledAt,
          minDelaySeconds,
          hourlyLimit
        }
      });

      await emailQueue.add(
        'send-email',
        { emailJobId: emailJob.id },
        {
          jobId: emailJob.id,
          delay: Math.max(0, scheduledAt.getTime() - Date.now())
        }
      );

      await tx.emailJob.update({
        where: { id: emailJob.id },
        data: { externalJobId: emailJob.id }
      });

      created.push({ id: emailJob.id });
    }

    return created;
  });

  return res.json({ scheduledCount: createdJobs.length, jobs: createdJobs });
});

app.get('/api/emails/scheduled', async (_req, res) => {
  const items = await prisma.emailJob.findMany({
    where: { status: 'SCHEDULED' },
    orderBy: { scheduledAt: 'asc' }
  });

  res.json({ items });
});

app.get('/api/emails/sent', async (_req, res) => {
  const items = await prisma.emailJob.findMany({
    where: { status: { in: ['SENT', 'FAILED'] } },
    orderBy: { sentAt: 'desc' }
  });

  res.json({ items });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.port}`);
});
