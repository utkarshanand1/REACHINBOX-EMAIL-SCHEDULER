import { connection } from './queue';

const delayScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local current = redis.call('GET', key)
if not current then
  local nextTime = now + minDelay
  redis.call('SET', key, nextTime)
  redis.call('PEXPIRE', key, minDelay * 100)
  return 0
end
current = tonumber(current)
if current <= now then
  local nextTime = now + minDelay
  redis.call('SET', key, nextTime)
  redis.call('PEXPIRE', key, minDelay * 100)
  return 0
end
local wait = current - now
local nextTime = current + minDelay
redis.call('SET', key, nextTime)
redis.call('PEXPIRE', key, minDelay * 100)
return wait
`;

const rateScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local expireAt = tonumber(ARGV[2])
local current = redis.call('GET', key)
if not current then current = 0 else current = tonumber(current) end
if current >= limit then
  return -1
end
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIREAT', key, expireAt)
end
return count
`;

export function getHourWindowKey(senderEmail: string, date: Date) {
  const hour = date.toISOString().slice(0, 13).replace(/[:T]/g, '-');
  return `rate:${senderEmail}:${hour}`;
}

export function getHourWindowEnd(date: Date) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function getNextHourStart(date: Date) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export async function reserveSendSlot(senderEmail: string, minDelayMs: number) {
  const key = `delay:${senderEmail}`;
  const now = Date.now();
  const waitMs = (await connection.eval(delayScript, 1, key, now, minDelayMs)) as number;
  return Number(waitMs);
}

export async function tryIncrementHourly(senderEmail: string, limit: number, now: Date) {
  const key = getHourWindowKey(senderEmail, now);
  const windowEnd = getHourWindowEnd(now);
  const expireAt = Math.floor(windowEnd.getTime() / 1000);
  const result = (await connection.eval(rateScript, 1, key, limit, expireAt)) as number;
  return Number(result);
}
