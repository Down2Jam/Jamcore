# Feature Modules

`jamcore` is being reorganized around feature folders instead of only top-level technical layers.

Current feature modules:

- `achievements`
- `admin-users`
- `admin-images`
- `comments`
- `content-admin`
- `emojis`
- `events`
- `federation`
- `games`
- `jams`
- `mentions`
- `notifications`
- `posts`
- `reactions`
- `ratings`
- `results`
- `recap`
- `search`
- `scores`
- `session`
- `site-themes`
- `streamers`
- `teams`
- `taxonomies`
- `themes`
- `tracks`
- `uploads`
- `users`

Each feature should prefer this shape when practical:

- `schemas.ts` for request/input validation
- `*.service.ts` for mutations/queries
- `index.ts` for stable public exports

Legacy top-level files under `services/` remain as compatibility re-exports while routes and middleware migrate.
