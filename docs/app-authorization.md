# App authorization

Public GET requests need no app registration or token. Omit `Authorization` and
use `credentials: "omit"` in browser apps. Private data and actions on a user's
behalf require OAuth authorization.

## Register an app

Open **Settings → Your apps → Register app**. Enter a name and redirect URL, then
copy the client ID. HTTPS is required except on localhost. Redirect URLs must
match exactly; wildcards, fragments and embedded credentials are not accepted.
Apps use authorization code with PKCE (S256), without a client secret.

## Connect a user

Generate a random PKCE verifier (43–128 characters) and `state` (16–1024 characters).
Save both for the callback. The challenge is `base64url(SHA-256(verifier))`, without
padding. Send the user to `/api/v1/oauth/authorize` with:

```text
response_type=code
client_id=<client ID>
redirect_uri=<registered redirect URL>
scope=profile:read content:read
state=<random state>
code_challenge=<challenge>
code_challenge_method=S256
```

The user signs in and approves or cancels. On callback, verify `state` before
continuing. Cancellation returns `error=access_denied`; approval returns a
single-use `code` valid for five minutes.

Exchange the code at `POST /api/v1/oauth/token`:

```js
const response = await fetch(`${apiOrigin}/api/v1/oauth/token`, {
  method: "POST",
  credentials: "omit",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: savedVerifier,
  }),
});
const tokens = await response.json();
```

The response contains `access_token`, `refresh_token`, `token_type` (`Bearer`),
`expires_in` (seconds), and `scope`, without a `data` wrapper. JSON request bodies
are also accepted.

## Use and renew access

Send `Authorization: Bearer <access_token>` with `credentials: "omit"`.
Use `GET /api/v1/self` with `profile:read` to identify the user; no ID token is issued.

Access tokens last 15 minutes. Refresh at `POST /api/v1/oauth/token` with:

```json
{
  "grant_type": "refresh_token",
  "client_id": "<client ID>",
  "refresh_token": "<current refresh token>"
}
```

Replace both tokens after each refresh. Serialize refresh requests: reusing a
consumed refresh token revokes the authorization. Don't blindly retry after an
uncertain network result. `invalid_grant` requires reconnecting the user.
Authorization expires after 30 days, even with refreshes. Keep tokens out of URLs
and logs.

A missing scope returns 403; invalid or expired access returns 401. Omit the token
when requesting only public data. Player progress uses `/self/achievements` and
`/self/scores`, which require authentication.

## Permissions

| Scope | Access |
| --- | --- |
| `profile:read` | Account summary and current game |
| `content:read` | Authenticated content views, including accessible unpublished content |
| `content:write` | Content, uploads, comments, reactions, follows, participation and reports |
| `messages:read`, `messages:write` | Private messages; write also allows blocking/unblocking |
| `notifications:read`, `notifications:write` | Notifications and preferences |
| `games:read` | Game data and the user's scores and achievements |
| `games:write` | Submit and manage scores and achievements |

See [route coverage](app-api-coverage.md) for each endpoint's requirements and
website-only operations. Scopes do not override ownership or visibility checks
and do not grant administrator or moderator privileges.

## Disconnect

Users revoke access in **Settings → Tokens → Apps with access**. Apps can call
`POST /api/v1/oauth/revoke` with `{ "token": "<access or refresh token>" }`.
Disabling an app in **Your apps** revokes access for all its users.
