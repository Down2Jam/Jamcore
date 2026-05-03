CREATE OR REPLACE FUNCTION normalize_legacy_local_asset_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    value,
    'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(?=/api/v1/(image|pfp|music)/)',
    '',
    'g'
  );
$$;

UPDATE "User"
SET
  "profilePicture" = normalize_legacy_local_asset_url("profilePicture"),
  "updatedAt" = NOW()
WHERE "profilePicture" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "User"
SET
  "bannerPicture" = normalize_legacy_local_asset_url("bannerPicture"),
  "updatedAt" = NOW()
WHERE "bannerPicture" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "User"
SET
  "profileBackground" = normalize_legacy_local_asset_url("profileBackground"),
  "updatedAt" = NOW()
WHERE "profileBackground" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "GamePage"
SET
  "thumbnail" = normalize_legacy_local_asset_url("thumbnail"),
  "updatedAt" = NOW()
WHERE "thumbnail" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "GamePage"
SET
  "banner" = normalize_legacy_local_asset_url("banner"),
  "updatedAt" = NOW()
WHERE "banner" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "GamePage"
SET
  "screenshots" = ARRAY(
    SELECT normalize_legacy_local_asset_url(url)
    FROM unnest("screenshots") AS url
  ),
  "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM unnest("screenshots") AS url
  WHERE url ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/'
);

UPDATE "GamePageTrack"
SET
  "url" = normalize_legacy_local_asset_url("url"),
  "updatedAt" = NOW()
WHERE "url" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "Score"
SET
  "evidence" = normalize_legacy_local_asset_url("evidence"),
  "updatedAt" = NOW()
WHERE "evidence" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "GamePageAchievement"
SET
  "image" = normalize_legacy_local_asset_url("image"),
  "updatedAt" = NOW()
WHERE "image" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "Reaction"
SET
  "image" = normalize_legacy_local_asset_url("image"),
  "updatedAt" = NOW()
WHERE "image" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "PressKitMedia"
SET
  "image" = normalize_legacy_local_asset_url("image"),
  "updatedAt" = NOW()
WHERE "image" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "Post"
SET
  "content" = normalize_legacy_local_asset_url("content"),
  "updatedAt" = NOW()
WHERE "content" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "Comment"
SET
  "content" = normalize_legacy_local_asset_url("content"),
  "updatedAt" = NOW()
WHERE "content" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "Event"
SET
  "content" = normalize_legacy_local_asset_url("content"),
  "updatedAt" = NOW()
WHERE "content" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

UPDATE "DocumentationDocument"
SET
  "content" = normalize_legacy_local_asset_url("content"),
  "updatedAt" = NOW()
WHERE "content" ~ 'https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/v1/(image|pfp|music)/';

DROP FUNCTION normalize_legacy_local_asset_url(text);
