UPDATE "Game"
SET "category" = 'EXTERNAL'
WHERE "source_platform" = 'ITCH'
  AND "category" = 'EXTRA';
