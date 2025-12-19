import type { KVNamespace } from '@cloudflare/workers-types';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';

export type Env = {
  KV: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 10; // requests per window per IP

function generateCode() {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `${letter}${digits}`;
}

async function rateLimit(c: Context): Promise<Response | undefined> {
  const ip = c.req.header('cf-connecting-ip') || 'global';
  const key = `ratelimit:${ip}`;
  const now = Date.now();

  const record = (await c.env.KV.get(key, { type: 'json' })) || {
    count: 0,
    expires: now + RATE_LIMIT_WINDOW * 1000,
  };

  if (record.expires < now) {
    await c.env.KV.put(
      key,
      JSON.stringify({
        count: 1,
        expires: now + RATE_LIMIT_WINDOW * 1000,
      }),
      {
        expirationTtl: RATE_LIMIT_WINDOW,
      },
    );
    return;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return c.json(
      {
        error: 'Rate limit exceeded. Try again later.',
        retryAfter: Math.ceil((record.expires - now) / 1000),
      },
      429,
    );
  }

  record.count += 1;
  const safeTtl = Math.max(60, Math.ceil((record.expires - now) / 1000));

  await c.env.KV.put(key, JSON.stringify(record), {
    expirationTtl: safeTtl,
  });
}

const allowedOrigins = ['http://localhost:*', 'https://timed.cc'];

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST'],
  }),
);

app.get('/', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  return c.json({
    message: 'Welcome to the timed.cc API',
    version: '1.0.0',
  });
});

app.post('/create', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  const { encryptedUrl, customCode } = await c.req.json();
  if (!encryptedUrl) return c.json({ error: 'Missing encryptedUrl' }, 400);

  // generate a random code if customCode is not provided
  let code: string;
  let exists: string | null;
  do {
    code = customCode || generateCode();
    exists = await c.env.KV.get(code);
  } while (exists);

  const ttl = 300;
  const expiresAt = Date.now() + ttl * 1000;

  try {
    await c.env.KV.put(code, JSON.stringify({ encryptedUrl }), {
      expirationTtl: ttl,
    });
  } catch (err) {
    console.error('Error saving to KV:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }

  return c.json({ code, expiresAt });
});

app.get('/resolve/:code', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  const code = decodeURIComponent(c.req.param('code'));
  let result = await c.env.KV.get(code);

  if (!result) {
    result = await c.env.KV.get(code.toUpperCase());
  }

  if (!result) return c.json({ error: 'Not found or expired' }, 404);

  return c.json(JSON.parse(result), 200, {
    'Cache-Control': 'public, max-age=300',
    'Content-Type': 'application/json',
  });
});

app.get('/ping', (c) => {
  return c.json({ status: 'ok', time: Date.now() }, 200, {
    'Cache-Control': 'no-cache',
  });
});

app.get('/warmup', async (c) => {
  await c.env.KV.get('warmcheck').catch(() => { });
  return c.json({ status: 'ok' }, 200, {
    'Cache-Control': 'public, max-age=30',
  });
});

export default {
  fetch: app.fetch,
};
