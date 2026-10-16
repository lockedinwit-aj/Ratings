import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const respond = (status, obj) => new Response(JSON.stringify(obj), { status, headers });
const storeName = 'customer-reviews';

function authorized(request) {
  const expected = process.env.ADMIN_REVIEW_PASSWORD;
  const provided = request.headers.get('x-admin-password') || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body
    });
    if (!res.ok) return false;
    const result = await res.json();
    return result.success === true && result.hostname === 'woodworkwithaj.netlify.app';
  } catch (error) {
    console.error('Turnstile error', error);
    return false;
  }
}

export default async (request) => {
  try {
    const store = getStore(storeName);
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const admin = url.searchParams.get('admin') === '1';
      if (admin && !authorized(request)) return respond(401, { error: 'Incorrect Admin Password.' });
      const { blobs } = await store.list({ paginate: false });
      const entries = await Promise.all(blobs.slice(0, 250).map(async ({ key }) => {
        try {
          const review = await store.get(key, { type: 'json' });
          return review ? { ...review, ...(admin ? { key } : {}) } : null;
        } catch { return null; }
      }));
      const reviews = entries
        .filter(r => r && r.name && r.message && Number.isInteger(r.rating))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 100);
      return respond(200, { reviews });
    }

    if (request.method === 'DELETE') {
      if (!authorized(request)) return respond(401, { error: 'Incorrect Admin Password.' });
      const input = await request.json().catch(() => ({}));
      const key = String(input.key || '');
      if (!/^\d{4}-\d{2}-\d{2}T[^\s]{10,40}-[0-9a-f-]{36}$/i.test(key)) {
        return respond(400, { error: 'Invalid Review Identifier.' });
      }
      const existing = await store.get(key);
      if (existing === null) return respond(404, { error: 'Review Not Found.' });
      await store.delete(key);
      return respond(200, { ok: true });
    }

    if (request.method !== 'POST') return respond(405, { error: 'Method Not Allowed.' });
    if (Number(request.headers.get('content-length') || 0) > 5000) {
      return respond(413, { error: 'Review Is Too Long.' });
    }
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== 'object') return respond(400, { error: 'Invalid Request.' });
    if (input.website) return respond(200, { ok: true });
    if (!await verifyTurnstile(input.turnstileToken)) {
      return respond(403, { error: 'Security Check Failed. Please Try Again.' });
    }
    const name = String(input.name || '').trim();
    const message = String(input.message || input.text || '').trim();
    const rating = Number(input.rating);
    if (!name || name.length > 60 || message.length < 5 || message.length > 1000 ||
        !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return respond(400, { error: 'Please Enter A Name, 1–5 Stars, And A Review Of 5–1000 Characters.' });
    }
    const createdAt = new Date().toISOString();
    const key = `${createdAt}-${crypto.randomUUID()}`;
    await store.setJSON(key, { name, message, rating, createdAt });
    return respond(201, { ok: true });
  } catch (error) {
    console.error('Reviews function failed', error);
    return respond(500, { error: 'Reviews Are Temporarily Unavailable.' });
  }
};
