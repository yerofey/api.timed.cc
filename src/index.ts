import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 10;    // requests per window per IP

function generateCode() {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const digits = Math.floor(10000 + Math.random() * 90000)
  return `${letter}${digits}`
}

async function rateLimit(c: any): Promise<Response | undefined> {
  const ip = c.req.header('cf-connecting-ip') || 'global';
  const key = `ratelimit:${ip}`;
  const now = Date.now();

  const record = await c.env.timed.get(key, { type: 'json' }) || {
    count: 0,
    expires: now + RATE_LIMIT_WINDOW * 1000
  };

  if (record.expires < now) {
    await c.env.timed.put(key, JSON.stringify({
      count: 1,
      expires: now + RATE_LIMIT_WINDOW * 1000
    }), {
      expirationTtl: RATE_LIMIT_WINDOW
    });
    return;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return c.json({
      error: 'Rate limit exceeded. Try again later.',
      retryAfter: Math.ceil((record.expires - now) / 1000),
    }, 429);
  }

  record.count += 1;
  const safeTtl = Math.max(60, Math.ceil((record.expires - now) / 1000));

  await c.env.timed.put(key, JSON.stringify(record), {
    expirationTtl: safeTtl
  });
}

const allowedOrigins = [
  'http://localhost:*',
  'https://timed.cc',
];

app.use('*', cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST'],
}))

app.get('/', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  return c.json({
    message: 'Welcome to the timed.cc API',
    version: '1.0.0',
  })
})

app.get('/admin/list', async (c) => {
  if (c.req.header('x-api-key') !== c.env.ADMIN_KEY) {
    return c.json({
      error: 'Unauthorized',
    }, 401)
  }

  const keys = await c.env.timed.list()
  return c.json(keys)
})

app.post('/create', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  const { encryptedUrl, customCode } = await c.req.json()
  if (!encryptedUrl) return c.json({ error: 'Missing encryptedUrl' }, 400)

  // generate a random code if customCode is not provided
  let code
  let exists
  do {
    code = customCode || generateCode()
    exists = await c.env.timed.get(code)
  } while (exists)

  const ttl = 300
  const expiresAt = Date.now() + ttl * 1000

  try {
    await c.env.timed.put(code, JSON.stringify({ encryptedUrl }), { expirationTtl: ttl })
  }
  catch (err) {
    console.error('Error saving to KV:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }

  return c.json({ code, expiresAt })
})

app.get('/resolve/:code', async (c) => {
  const limited = await rateLimit(c);
  if (limited) return limited;

  const code = decodeURIComponent(c.req.param('code'))
  const result = await c.env.timed.get(code)

  if (!result) return c.json({ error: 'Not found or expired' }, 404)

  return c.json(JSON.parse(result))
})

app.get('/ping', (c) => {
  return c.json({ status: 'ok', time: Date.now() })
})

export default app
