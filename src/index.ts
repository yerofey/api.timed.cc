import { Hono } from 'hono'
import { cors } from 'hono/cors'

function generateCode() {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const digits = Math.floor(10000 + Math.random() * 90000)
  return `${letter}:${digits}`
}

const app = new Hono()

// Enable CORS globally
app.use('*', cors({
  origin: '*', // Allow all origins
}))

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
  const { url, customCode } = await c.req.json()
  if (!url) return c.json({ error: 'Missing URL' }, 400)

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
    await c.env.timed.put(code, JSON.stringify({ url }), { expirationTtl: ttl })
  }
  catch (err) {
    console.error('Error saving to KV:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }

  return c.json({ code, url, expiresAt })
})

app.get('/resolve/:code', async (c) => {
  const code = decodeURIComponent(c.req.param('code'))
  const result = await c.env.timed.get(code)

  if (!result) return c.json({ error: 'Not found or expired' }, 404)

  const { url } = JSON.parse(result)

  return c.json({ url })
})

app.get('/ping', (c) => {
  return c.json({ status: 'ok', time: Date.now() })
})

export default app
