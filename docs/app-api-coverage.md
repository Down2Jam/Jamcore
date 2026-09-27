# App API coverage

Generated from the API registry and app scope policy with `npx tsx scripts/generate-app-coverage.ts`.

Paths are relative to `/api/v1`. Public reads need no token; HEAD follows GET. Player progress lives under `/self` and requires authentication. Protocol endpoints retain their own credential requirements. See [app authorization](app-authorization.md) for setup.

| Method | Route | Anonymous access | App scope |
| --- | --- | --- | --- |
| GET | `/admin/jam-games` | Internal | Not delegated |
| GET | `/openapi` | Yes | Omit Authorization |
| GET | `/capabilities` | Yes | Omit Authorization |
| GET | `/games` | Yes | `content:read` |
| GET | `/games/featured-videos` | Yes | `content:read` |
| GET | `/games/random` | Public data only | `content:read` |
| POST | `/games` | No | `content:write` |
| POST | `/games/import/itch` | No | `content:write` |
| POST | `/games/import/itch/preview` | No | `content:write` |
| GET | `/games/{gameSlug}` | Public data only | `content:read` |
| PUT | `/games/{gameSlug}` | No | `content:write` |
| POST | `/games/{gameSlug}/post-jam` | No | `content:write` |
| GET | `/games/{gameSlug}/devlog` | Public data only | `content:read` |
| GET | `/jams` | Yes | `content:read` |
| GET | `/jams/random` | Yes | `content:read` |
| GET | `/jams/{jamSlug}` | Yes | `content:read` |
| GET | `/jams/{jamSlug}/participation` | No | `content:read` |
| POST | `/join-jam` | No | `content:write` |
| DELETE | `/jams/{jamSlug}/participation` | No | `content:write` |
| GET | `/results` | Public data only | `content:read` |
| GET | `/recap` | Public data only | `content:read` |
| PUT | `/recap` | No | `content:write` |
| GET | `/tracks` | Public data only | `content:read` |
| GET | `/tracks/random` | Public data only | `content:read` |
| GET | `/tracks/{trackSlug}` | Public data only | `content:read` |
| PUT | `/tracks/{trackSlug}` | No | `content:write` |
| GET | `/music/{filename}` | Yes | `content:read` |
| GET | `/music/track/{trackSlug}/download` | Yes | `content:read` |
| POST | `/music` | No | `content:write` |
| GET | `/events/{eventSlug}` | Yes | `content:read` |
| GET | `/events` | Yes | `content:read` |
| POST | `/events` | No | `content:write` |
| GET | `/posts` | Public data only | `content:read` |
| GET | `/posts/linkable-games` | No | `content:read` |
| GET | `/posts/{postSlug}` | Public data only | `content:read` |
| POST | `/posts` | No | `content:write` |
| PUT | `/posts/{postSlug}` | No | `content:write` |
| DELETE | `/posts/{postSlug}` | No | `content:write` |
| GET | `/posts/preview/{previewToken}` | Public data only | `content:read` |
| GET | `/posts/{postSlug}/revisions` | No | `content:read` |
| POST | `/posts/{postSlug}/publish` | No | `content:write` |
| GET | `/posts/autosave` | No | `content:read` |
| POST | `/posts/autosave` | No | `content:write` |
| GET | `/posts/series` | Public data only | `content:read` |
| POST | `/posts/series` | No | `content:write` |
| GET | `/posts/series/{seriesId}` | Public data only | `content:read` |
| PUT | `/posts/series/{seriesId}` | No | `content:write` |
| POST | `/posts/series/{seriesId}/posts` | No | `content:write` |
| DELETE | `/posts/series/{seriesId}/posts/{postId}` | No | `content:write` |
| GET | `/collections` | Public data only | `content:read` |
| POST | `/collections` | No | `content:write` |
| POST | `/collections/import` | No | `content:write` |
| GET | `/collections/link-preview` | Yes | `content:read` |
| GET | `/collections/{collectionId}` | Public data only | `content:read` |
| GET | `/collections/{collectionId}/export` | Public data only | `content:read` |
| PUT | `/collections/{collectionId}` | No | `content:write` |
| DELETE | `/collections/{collectionId}` | No | `content:write` |
| POST | `/collections/{collectionId}/items` | No | `content:write` |
| DELETE | `/collections/{collectionId}/items/{itemId}` | No | `content:write` |
| POST | `/collections/{collectionId}/collaborators` | No | `content:write` |
| PUT | `/collections/{collectionId}/collaborators/me` | No | `content:write` |
| POST | `/collections/{collectionId}/fork` | No | `content:write` |
| GET | `/collections/{collectionId}/playback` | Public data only | `content:read` |
| POST | `/collections/{collectionId}/follow` | No | `content:write` |
| POST | `/collections/{collectionId}/comments` | No | `content:write` |
| GET | `/collections/{collectionId}/comments` | Public data only | `content:read` |
| DELETE | `/collections/{collectionId}/comments/{commentId}` | No | `content:write` |
| GET | `/quilts` | Yes | `content:read` |
| POST | `/quilts` | No | Website only |
| GET | `/quilts/{quiltSlug}` | Public data only | `content:read` |
| POST | `/quilts/{quiltSlug}/submissions` | No | `content:write` |
| POST | `/quilts/{quiltSlug}/resize` | No | Website only |
| POST | `/quilts/submissions/{submissionId}/vote` | No | `content:write` |
| PUT | `/quilts/submissions/{submissionId}` | No | `content:write` |
| POST | `/quilts/submissions/{submissionId}/accept` | No | Website only |
| DELETE | `/quilts/submissions/{submissionId}` | No | `content:write` |
| GET | `/radio` | Public data only | `content:read` |
| POST | `/radio/vote` | No | `content:write` |
| POST | `/radio/duration` | Protocol / handler rules | `content:write` |
| POST | `/radio/emote` | No | `content:write` |
| GET | `/radio/events` | Public data only | `content:read` |
| GET | `/comment/replies` | Public data only | `content:read` |
| POST | `/comment` | No | `content:write` |
| PUT | `/comment` | No | `content:write` |
| DELETE | `/comment` | No | `content:write` |
| POST | `/track-timestamp-comments` | No | `content:write` |
| POST | `/post/reaction` | No | `content:write` |
| POST | `/comment/reaction` | No | `content:write` |
| POST | `/like` | No | `content:write` |
| POST | `/achievement` | No | `games:write` |
| DELETE | `/achievement` | No | `games:write` |
| GET | `/tags` | Yes | Omit Authorization |
| GET | `/gametags` | Yes | Omit Authorization |
| GET | `/tracktags` | Yes | Omit Authorization |
| GET | `/flags` | Yes | Omit Authorization |
| GET | `/trackflags` | Yes | Omit Authorization |
| GET | `/rating-categories` | Yes | Omit Authorization |
| GET | `/track-rating-categories` | Yes | Omit Authorization |
| GET | `/teamroles` | Yes | Omit Authorization |
| GET | `/search` | Yes | Omit Authorization |
| GET | `/users/search` | Yes | `content:read` |
| GET | `/mentions` | Yes | Omit Authorization |
| GET | `/users` | Yes | Omit Authorization |
| GET | `/users/{userSlug}` | Public data only | `content:read` |
| POST | `/users` | Protocol / handler rules | Omit Authorization |
| PUT | `/users/{userSlug}` | No | Website only |
| POST | `/users/{userSlug}/follow` | No | `content:write` |
| DELETE | `/users/{userSlug}` | No | Website only |
| GET | `/teams` | Yes | `content:read` |
| GET | `/teams/{teamId}` | No | `content:read` |
| POST | `/teams` | No | `content:write` |
| PUT | `/teams/{teamId}` | No | `content:write` |
| DELETE | `/teams/{teamId}` | No | `content:write` |
| DELETE | `/leave-team` | No | `content:write` |
| POST | `/invite` | No | `content:write` |
| DELETE | `/invite` | No | `content:write` |
| POST | `/application` | No | `content:write` |
| DELETE | `/application` | No | `content:write` |
| GET | `/themes` | Public data only | `content:read` |
| GET | `/theme` | Yes | Omit Authorization |
| GET | `/languages` | Yes | Omit Authorization |
| PUT | `/languages/current` | No | Website only |
| GET | `/site-themes` | Yes | Omit Authorization |
| GET | `/themes/suggestion` | No | `content:read` |
| POST | `/themes/suggestion` | No | `content:write` |
| DELETE | `/themes/suggestion/{id}` | No | `content:write` |
| GET | `/themes/votes` | No | `content:read` |
| POST | `/themes/vote` | No | `content:write` |
| POST | `/themes/voteSlaughter` | No | `content:write` |
| POST | `/themes/voteVoting` | No | `content:write` |
| POST | `/session` | Protocol / handler rules | Omit Authorization |
| DELETE | `/session` | Protocol / handler rules | Omit Authorization |
| GET | `/self` | No | `profile:read` |
| GET | `/self/current-game` | No | `profile:read` |
| GET | `/self/game-tokens` | No | Website only |
| DELETE | `/self/game-tokens` | No | Website only |
| DELETE | `/self/game-tokens/current` | No | Website only |
| POST | `/device/code` | Protocol / handler rules | Omit Authorization |
| POST | `/device/approve` | No | Website only |
| POST | `/device/deny` | No | Website only |
| POST | `/device/token` | Protocol / handler rules | Omit Authorization |
| GET | `/notifications` | No | `notifications:read` |
| PUT | `/notifications/read-all` | No | `notifications:write` |
| PUT | `/notifications/{id}` | No | `notifications:write` |
| DELETE | `/notifications/{id}` | No | `notifications:write` |
| GET | `/notifications/preferences` | No | `notifications:read` |
| PUT | `/notifications/preferences` | No | `notifications:write` |
| POST | `/reports` | No | `content:write` |
| GET | `/image/{filename}` | Yes | `content:read` |
| POST | `/image` | No | `content:write` |
| GET | `/pfp/{filename}` | Yes | Omit Authorization |
| GET | `/pfps` | Yes | Omit Authorization |
| GET | `/press-kit-media` | Yes | Omit Authorization |
| POST | `/press-kit-media` | Internal | Not delegated |
| DELETE | `/press-kit-media` | Internal | Not delegated |
| GET | `/emojis` | Yes | `content:read` |
| POST | `/emojis` | Internal | Not delegated |
| PUT | `/emojis` | No | `content:write` |
| DELETE | `/emojis` | No | `content:write` |
| POST | `/emojis/game` | No | `content:write` |
| POST | `/emojis/user` | No | `content:write` |
| GET | `/streamers` | Yes | Omit Authorization |
| POST | `/rating` | No | `content:write` |
| POST | `/track-rating` | No | `content:write` |
| POST | `/score` | No | `games:write` |
| DELETE | `/score` | No | `games:write` |
| POST | `/mod` | Internal | Not delegated |
| GET | `/documentation-document` | Yes | Omit Authorization |
| POST | `/documentation-document` | Internal | Not delegated |
| PUT | `/documentation-document` | Internal | Not delegated |
| DELETE | `/documentation-document` | Internal | Not delegated |
| GET | `/documentation-documents` | Yes | Omit Authorization |
| GET | `/admin/images` | Internal | Not delegated |
| GET | `/platform/audit` | Internal | Not delegated |
| GET | `/platform/webhooks` | Internal | Not delegated |
| POST | `/platform/webhooks` | Internal | Not delegated |
| PUT | `/platform/webhooks` | Internal | Not delegated |
| DELETE | `/platform/webhooks` | Internal | Not delegated |
| GET | `/platform/events` | Internal | Not delegated |
| GET | `/platform/checkpoints` | Internal | Not delegated |
| POST | `/platform/checkpoints` | Internal | Not delegated |
| GET | `/platform/roles` | Internal | Not delegated |
| POST | `/platform/roles` | Internal | Not delegated |
| DELETE | `/platform/roles` | Internal | Not delegated |
| GET | `/platform/service-keys` | Internal | Not delegated |
| POST | `/platform/service-keys` | Internal | Not delegated |
| PUT | `/platform/service-keys` | Internal | Not delegated |
| DELETE | `/platform/service-keys` | Internal | Not delegated |
| GET | `/platform/jobs` | Internal | Not delegated |
| PUT | `/platform/jobs` | Internal | Not delegated |
| GET | `/platform/sync` | Internal | Not delegated |
| GET | `/platform/search` | Internal | Not delegated |
| POST | `/platform/search` | Internal | Not delegated |
| PUT | `/platform/search` | Internal | Not delegated |
| DELETE | `/platform/search` | Internal | Not delegated |
| GET | `/platform/export` | Internal | Not delegated |
| POST | `/platform/import` | Internal | Not delegated |
| POST | `/platform/restore` | Internal | Not delegated |
| GET | `/platform/moderation` | Internal | Not delegated |
| GET | `/platform/content-review` | Internal | Not delegated |
| PUT | `/platform/content-review` | Internal | Not delegated |
| GET | `/platform/reports` | Internal | Not delegated |
| PUT | `/platform/reports` | Internal | Not delegated |
| POST | `/platform/reports/notes` | Internal | Not delegated |
| GET | `/platform/federation` | Internal | Not delegated |
| POST | `/platform/federation` | Internal | Not delegated |
| DELETE | `/platform/federation` | Internal | Not delegated |
| PUT | `/platform/radio` | Internal | Not delegated |
| GET | `/connections/twitch` | No | Website only |
| POST | `/connections/twitch` | No | Website only |
| POST | `/session/refresh` | Protocol / handler rules | Omit Authorization |
| GET | `/oauth/authorize` | Yes | Omit Authorization |
| GET | `/oauth/request` | Yes | Omit Authorization |
| POST | `/oauth/authorize` | No | Website only |
| POST | `/oauth/token` | Protocol / handler rules | Omit Authorization |
| POST | `/oauth/revoke` | Protocol / handler rules | Omit Authorization |
| GET | `/oauth/apps` | No | Website only |
| POST | `/oauth/apps` | No | Website only |
| DELETE | `/oauth/apps` | No | Website only |
| GET | `/oauth/connections` | No | Website only |
| DELETE | `/oauth/connections` | No | Website only |
| GET | `/messages/counts` | No | `messages:read` |
| GET | `/messages/conversations` | No | `messages:read` |
| POST | `/messages/conversations` | No | `messages:write` |
| GET | `/messages/conversations/{id}/messages` | No | `messages:read` |
| POST | `/messages/conversations/{id}/messages` | No | `messages:write` |
| PUT | `/messages/conversations/{id}` | No | `messages:write` |
| PUT | `/users/{userSlug}/block` | No | `messages:write` |
| DELETE | `/users/{userSlug}/block` | No | `messages:write` |
| GET | `/games/{gameSlug}/leaderboards` | Public data only | `games:read` |
| GET | `/games/{gameSlug}/achievements` | Public data only | `games:read` |
| GET | `/leaderboards/{leaderboardId}/scores` | Public data only | `games:read` |
| GET | `/self/game-context` | No | `games:read` |
| GET | `/self/achievements` | No | `games:read` |
| GET | `/self/scores` | No | `games:read` |
