-- Overview of main data: record counts grouped by resource.
-- Run with: sqlite3 data/associationhog.sqlite < sqliteScripts/overview.sql

.headers on
.mode column

.print ================================================
.print Total records by resource (source)
.print ================================================
SELECT
    source                                       AS resource,
    COUNT(*)                                     AS total_posts,
    COUNT(DISTINCT city)                         AS distinct_cities,
    MIN(first_seen)                              AS first_seen,
    MAX(last_seen)                               AS last_seen
FROM posts
GROUP BY source
ORDER BY total_posts DESC;

.print
.print ================================================
.print Total records overall
.print ================================================
SELECT
    COUNT(*)                                     AS total_posts,
    COUNT(DISTINCT source)                       AS resources
FROM posts;

.print
.print ================================================
.print Top cities across all resources
.print ================================================
SELECT
    city,
    COUNT(*) AS total_posts
FROM posts
WHERE city IS NOT NULL AND TRIM(city) != ''
GROUP BY city
ORDER BY total_posts DESC
LIMIT 15;
