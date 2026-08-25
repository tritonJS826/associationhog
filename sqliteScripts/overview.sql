-- Overview of main data: record counts grouped by resource.
-- Run with: sqlite3 data/associationhog.sqlite < sqliteScripts/overview.sql

.headers on
.mode column

.print ================================================
.print Total records by resource
.print ================================================
SELECT
    source                                       AS resource,
    COUNT(*)                                     AS total_posts,
    COUNT(DISTINCT city)                         AS distinct_cities
FROM posts
GROUP BY source
UNION ALL
SELECT
    'telegram:' || channel                       AS resource,
    COUNT(*)                                     AS total_posts,
    COUNT(DISTINCT city)                         AS distinct_cities
FROM telegram_messages
WHERE is_adoption_search = 1
GROUP BY channel
ORDER BY total_posts DESC;

.print
.print ================================================
.print Total records overall
.print ================================================
SELECT
    (SELECT COUNT(*) FROM posts) + (SELECT COUNT(*) FROM telegram_messages WHERE is_adoption_search = 1) AS total_posts,
    (SELECT COUNT(DISTINCT source) FROM posts) + (SELECT COUNT(DISTINCT channel) FROM telegram_messages WHERE is_adoption_search = 1) AS resources;

.print
.print ================================================
.print Top cities across all resources
.print ================================================
SELECT
    city,
    COUNT(*) AS total_posts
FROM (
    SELECT city FROM posts WHERE city IS NOT NULL AND TRIM(city) != ''
    UNION ALL
    SELECT city FROM telegram_messages WHERE is_adoption_search = 1 AND city IS NOT NULL AND TRIM(city) != '' AND city != 'no-info'
)
GROUP BY city
ORDER BY total_posts DESC
LIMIT 15;

.print
.print ================================================
.print Top cities by telegram channel
.print ================================================
SELECT
    'telegram:' || channel                          AS resource,
    city,
    COUNT(*)                                        AS total_posts
FROM telegram_messages
WHERE is_adoption_search = 1
  AND city IS NOT NULL AND TRIM(city) != '' AND city != 'no-info'
GROUP BY channel, city
ORDER BY resource, total_posts DESC;
