# ReachInbox Email Job Scheduler

Monorepo with:
- `backend/` Express + BullMQ + Redis + Postgres + Prisma
- `frontend/` React + Vite + Tailwind

## Quick Start

### 1) Infra
Run Redis and Postgres locally with Docker:

```
docker compose up -d
```

### 2) Backend

```
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Start the worker (separate terminal):

```
cd backend
npm run worker
```

### 3) Frontend

```
cd frontend
npm install
npm run dev
```

## Environment Variables
Set these in `backend/.env`:

- `DATABASE_URL` (Postgres)
- `REDIS_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Ethereal)
- `DEFAULT_MIN_DELAY_SECONDS`
- `DEFAULT_HOURLY_LIMIT`
- `WORKER_CONCURRENCY`

## Architecture Overview

- **Scheduling**: API creates a DB row per recipient and enqueues a BullMQ delayed job using the same ID for idempotency.
- **Persistence**: Jobs live in Redis and EmailJob records live in Postgres. On restart, BullMQ keeps delayed jobs.
- **Concurrency**: Worker concurrency is configured via `WORKER_CONCURRENCY`.
- **Min Delay Between Sends**: Redis-backed slot reservation ensures a minimum delay per sender.
- **Hourly Rate Limit**: Redis counter keyed by sender + hour window enforces `DEFAULT_HOURLY_LIMIT` (or per-request override). If limit is reached, the job is delayed into the next hour window.

## API

- `POST /api/emails/schedule`
- `GET /api/emails/scheduled`
- `GET /api/emails/sent`

## Status
Scaffolded backend and frontend with core queue/DB structure. UI and OAuth flow will be built next.
