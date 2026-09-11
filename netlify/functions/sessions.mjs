import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const store = getStore('focusblocks');

function authorized(request) {
  const configured = process.env.ACCESS_KEY || '';
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!configured || supplied.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

function clean(record) {
  return {
    id: String(record.id),
    date: String(record.date),
    ts: Number(record.ts),
    task: String(record.task || ''),
    block: String(record.block || 'Unassigned'),
    minutes: Number(record.minutes) || 25,
    updatedAt: Number(record.updatedAt) || Number(record.ts),
  };
}

function mergeSessions(remote, incoming) {
  const byId = new Map(remote.map((session) => [session.id, session]));
  incoming.forEach((record) => {
    const session = clean(record);
    if (!session.id || !Number.isFinite(session.ts)) return;
    const existing = byId.get(session.id);
    if (!existing || session.updatedAt >= existing.updatedAt) byId.set(session.id, session);
  });
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!process.env.ACCESS_KEY) return Response.json({ error: 'ACCESS_KEY is not configured' }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  const current = (await store.get('sessions', { type: 'json' })) || [];
  if (request.method === 'GET') return Response.json({ sessions: current });

  const body = await request.json().catch(() => ({}));
  const incoming = Array.isArray(body.sessions) ? body.sessions : [];
  const sessions = mergeSessions(current, incoming);
  await store.setJSON('sessions', sessions);
  return Response.json({ sessions });
};