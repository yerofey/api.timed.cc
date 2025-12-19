# api.timed.cc

Backend API for [timed.cc](https://timed.cc) — a quick cross-device link sharing service using short codes and QR.

This API is built with [Hono](https://hono.dev) and runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), using [Cloudflare KV](https://developers.cloudflare.com/workers/runtime-apis/kv/) for temporary link storage.

---

## Local Development

```bash
bun i
bun run dev
```

## Deploy to Cloudflare

```bash
bun run deploy
```

## API Endpoints

### `GET /`

Get the API information.

**Response**: JSON object with the following fields:

- `message`: A welcome message.
- `version`: The version of the API.

```js
{
  "message": "Welcome to the timed.cc API",
  "version": "1.0.0"
}
```

### `POST /create`

Create a new short link.

**Request**: JSON object with the following fields:

- `encryptedUrl`: The encrypted URL to be shortened.

```js
{
  "encryptedUrl": "U2FsdGVkX1/IGvUkIgxEmxSM6kitLRMVCgAroho0bCQqw+HaAcQpGk5X+f2jXMMI"
}
```

**Response**: JSON object with the following fields:

- `code`: The generated short code.
- `expiresAt`: The timestamp when the short link will expire.

```js
{
  "code": "A12345",
  "expiresAt": 1699999999999
}
```

### `GET /resolve/:code`

Resolve a short code to its original URL.

**Request**: URL parameter `code` (the short code).

- `code`: The short code to resolve.

```js
{
  "code": "A12345"
}
```

**Response**: JSON object with the following fields:

- `encryptedUrl`: The encrypted URL.

```js
{
  "encryptedUrl": "U2FsdGVkX1/IGvUkIgxEmxSM6kitLRMVCgAroho0bCQqw+HaAcQpGk5X+f2jXMMI"
}
```

### `GET /ping`

Check if the API is running.

**Response**: JSON object with the following fields:

- `status`: The status of the API.
- `timestamp`: The current timestamp.

```js
{
  "status": "ok",
  "timestamp": 1699999999999
}
```

## Notes

- All codes expire after 5 minutes using KV TTL.
- CORS is enabled for all origins by default in development.
- Keys are stored using Cloudflare Workers KV (`c.env.timed`).
- Use the `/admin/list` endpoint only in local/dev mode — never expose it in production without protection.
- Error handling is included for invalid input and failed KV access.

## Tech Stack

- [Bun](https://bun.com) for the runtime.
- [Hono](https://hono.dev) for the web framework.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) for serverless deployment.
- [Cloudflare KV](https://developers.cloudflare.com/workers/runtime-apis/kv/) for key-value storage.

## Author

[Yerofey S.](https://github.com/yerofey)

## License

[MIT](https://github.com/yerofey/api.timed.cc/blob/master/LICENSE)
