# Jamcore

Backend API for Down2Jam.

## Local Development

```bash
npm install
npm run dev
```

By default the API runs on `http://localhost:3005`.

Create a `.env` file with database and auth settings:

```env
POSTGRES_USER=jammer
POSTGRES_PASSWORD=INSERTPASSWORDHERE
POSTGRES_DB=jamcore
TOKEN_SECRET=RANDOMSTRINGHERE
```

## Docker

```bash
docker compose up --build -d
```

This starts Jamcore and its Postgres database.

## Production

```bash
npm run build
npm start
```

Useful environment variables:

```env
NODE_ENV=production
PORT=3005
CLIENT_ORIGIN=https://d2jam.com
DATABASE_URL=postgresql://user:password@host:5432/database
TOKEN_SECRET=RANDOMSTRINGHERE
```

## Configuration

### Browser game authentication

The device code/token endpoints and game-token-enabled mutation routes accept
cross-origin requests without cookies, including requests from sandboxed web
builds with an opaque origin. Browser games should use `credentials: "omit"`
and send their game token in the `Authorization` header. Device approval/denial
and account management retain credentialed CORS restricted to `CLIENT_ORIGIN`.
The iframe sandbox remains enabled. When adding a route with `allowGameToken`,
also update the method/path allowlist in `src/middleware/apiCors.ts`.

Optional app overrides can be placed in `app.config.json` or pointed to with `APP_CONFIG_PATH`.
Use `app.config.example.json` as the starting point.

## Health

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `GET /api/v1/openapi`
