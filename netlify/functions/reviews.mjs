
import { getStore } from '@netlify/blobs';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function reply(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

export default async function handler(request) {
  try {
    // Keep the existing customer reviews.
    const store = getStore('customer-reviews');

    if (request.method === 'GET') {
      const { blobs } = await store.list({
        paginate: false
      });

      const saved = await Promise.all(
        blobs.slice(0, 250).map(async ({ key }) => {
          try {
            return await store.get(key, { type: 'json' });
          } catch {
            return null;
          }
        })
      );

      const reviews = saved
        .filter(review =>
          review &&
          typeof review.name === 'string' &&
          review.name &&
          typeof review.message === 'string' &&
          review.message &&
          Number.isInteger(review.rating) &&
          review.rating >= 1 &&
          review.rating <= 5
        )
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(
            String(a.createdAt || '')
          )
        )
        .slice(0, 100);

      return reply(200, { reviews });
    }

    if (request.method !== 'POST') {
      return reply(405, {
        error: 'Method Not Allowed.'
      });
    }

    const contentLength = Number(
      request.headers.get('content-length') || 0
    );

    if (contentLength > 5000) {
      return reply(413, {
        error: 'Review Is Too Long.'
      });
    }

    let input;

    try {
      input = await request.json();
    } catch {
      return reply(400, {
        error: 'Please Submit A Valid Review.'
      });
    }

    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    ) {
      return reply(400, {
        error: 'Please Submit A Valid Review.'
      });
    }

    // Basic spam protection without Cloudflare.
    if (input.website) {
      return reply(200, { ok: true });
    }

    const name = String(input.name || '').trim();
    const message = String(input.message || '').trim();
    const rating = Number(input.rating);

    if (
      !name ||
      name.length > 60 ||
      message.length < 5 ||
      message.length > 1000 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return reply(400, {
        error:
          'Please Enter A Name, 1–5 Stars, And A Review Of 5–1000 Characters.'
      });
    }

    const createdAt = new Date().toISOString();
    const key = `${createdAt}-${crypto.randomUUID()}`;

    await store.setJSON(key, {
      name,
      message,
      rating,
      createdAt
    });

    return reply(201, { ok: true });

  } catch (error) {
    console.error('Customer reviews function failed:', error);

    return reply(500, {
      error: 'Reviews Are Temporarily Unavailable.'
    });
  }
}
