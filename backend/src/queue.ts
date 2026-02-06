import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';

export const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null
});

export const emailQueue = new Queue('email-send-queue', {
  connection
});
