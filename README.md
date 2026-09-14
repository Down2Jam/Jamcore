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

For third-party apps and alternate frontends, see [app authorization](docs/app-authorization.md)
for registration, PKCE consent, scoped access tokens, refresh and revocation.

The device code/token endpoints and game-token-enabled read and mutation routes accept
cross-origin requests without cookies, including requests from sandboxed web
builds with an opaque origin. Browser games should use `credentials: "omit"`
and send their game token in the `Authorization` header. Device approval/denial
and account management retain credentialed CORS restricted to `CLIENT_ORIGIN`.
The iframe sandbox remains enabled. When adding a route with `allowGameToken`,
also update the method/path allowlist in `src/middleware/apiCors.ts`.

### Reading game data

Paths below are relative to `/api/v1`.

| Endpoint | Returns | Authentication |
| --- | --- | --- |
| `GET /games/{gameSlug}/leaderboards` | Game summary and leaderboard definitions | Public for published games |
| `GET /games/{gameSlug}/achievements` | Achievement definitions | Public for published games |
| `GET /leaderboards/{leaderboardId}/scores` | Sorted scores and pagination | Public for published games |
| `GET /self/game-context` | Player summary, game and leaderboard definitions | Game token, website session or `games:read` app token |
| `GET /self/achievements` | Player’s owned achievements and unlock times | Same as above |
| `GET /self/scores` | Player’s scores on a leaderboard | Same as above |

Game definitions and achievement reads accept `pageVersion=JAM` (default) or
`POST_JAM`. Player game-context and achievement reads accept `gameId`, which
defaults to a game token’s linked game. Player score reads require `leaderboardId`.
Both score routes accept `limit` (1–100, default 25) and `offset` (default 0).
Public routes always return public-style data; personal results use the `/self`
routes, not a query flag. Game tokens are restricted to their linked game and
cannot use administrator, moderator or team-management privileges.

Score responses include `scores`, `leaderboard` and `nextOffset` (null on the
last page). Entries contain a public player summary, raw `data`, normalized
`score` and ordinal `position` within the result set. `onlyBest` boards return
one best score per player; other boards include individual entries and evidence.

Browser games send `Authorization: Bearer <gameToken>` with
`credentials: "omit"`. Anonymous requests omit Authorization. Obtain the player
and leaderboard IDs from `/self/game-context`, then read owned achievements at
`/self/achievements` or scores at `/self/scores?leaderboardId=123`.

Optional app overrides can be placed in `app.config.json` or pointed to with `APP_CONFIG_PATH`.
Use `app.config.example.json` as the starting point.

## Health

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `GET /api/v1/openapi`
