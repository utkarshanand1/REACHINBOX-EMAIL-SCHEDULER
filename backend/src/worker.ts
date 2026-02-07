import { Worker, Job, DelayedError } from 'bullmq';
import { config } from './config';
import { connection } from './queue';
import { prisma } from './db';
import { transporter } from './emailer';
import { getNextHourStart, reserveSendSlot, tryIncrementHourly } from './rateLimiter';

async function processEmail(job: Job) {
  const emailJobId = job.data.emailJobId as string | undefined;
  if (!emailJobId) return;

  const emailJob = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
  if (!emailJob) return;

  if (emailJob.status === 'SENT') return;

  const now = new Date();

  const reschedule = async (delayMs: number) => {
    await job.moveToDelayed(Date.now() + delayMs, job.token);
    throw new DelayedError();
  };

  if (emailJob.scheduledAt.getTime() > now.getTime()) {
    const delayMs = emailJob.scheduledAt.getTime() - now.getTime();
    await reschedule(delayMs);
  }

  const hourlyLimit = emailJob.hourlyLimit;
  const minDelayMs = emailJob.minDelaySeconds * 1000;

  const allowed = await tryIncrementHourly(emailJob.senderEmail, hourlyLimit, now);
  if (allowed === -1) {
    const nextHour = getNextHourStart(now);
    const delayMs = nextHour.getTime() - now.getTime();
    await reschedule(delayMs);
  }

  const waitMs = await reserveSendSlot(emailJob.senderEmail, minDelayMs);
  if (waitMs > 0) {
    await reschedule(waitMs);
  }

  try {
    await transporter.sendMail({
      from: emailJob.senderName
        ? `${emailJob.senderName} <${emailJob.senderEmail}>`
        : emailJob.senderEmail,
      to: emailJob.recipientEmail,
      subject: emailJob.subject,
      text: emailJob.body
    });

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: { increment: 1 },
        lastError: null
      }
    });
  } catch (error) {
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

const worker = new Worker('email-send-queue', processEmail, {
  connection,
  concurrency: config.worker.concurrency
});

worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error('Job failed', job?.id, err);
});

// eslint-disable-next-line no-console
console.log(`Worker running with concurrency ${config.worker.concurrency}`);
