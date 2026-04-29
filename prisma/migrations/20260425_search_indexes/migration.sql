CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS post_search_tsv_idx
  ON "Post"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("title", '') || ' ' || coalesce("content", '')
    )
  );

CREATE INDEX IF NOT EXISTS post_title_trgm_idx
  ON "Post"
  USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS user_search_tsv_idx
  ON "User"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("name", '') || ' ' || coalesce("slug", '')
    )
  );

CREATE INDEX IF NOT EXISTS user_name_trgm_idx
  ON "User"
  USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS team_search_tsv_idx
  ON "Team"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("name", '') || ' ' || coalesce("description", '')
    )
  );

CREATE INDEX IF NOT EXISTS team_name_trgm_idx
  ON "Team"
  USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS game_page_search_tsv_idx
  ON "GamePage"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("name", '') || ' ' || coalesce("short", '')
    )
  );

CREATE INDEX IF NOT EXISTS game_page_name_trgm_idx
  ON "GamePage"
  USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS track_search_tsv_idx
  ON "GamePageTrack"
  USING GIN (
    to_tsvector(
      'simple',
      coalesce("name", '') || ' ' || coalesce("commentary", '')
    )
  );

CREATE INDEX IF NOT EXISTS track_name_trgm_idx
  ON "GamePageTrack"
  USING GIN ("name" gin_trgm_ops);
