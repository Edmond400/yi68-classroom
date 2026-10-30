-- Remove only the fictitious responses used to verify the two deployment URLs.
-- Exact names, answer fields and test dates keep this cleanup narrowly scoped.
DELETE FROM birthday_responses
WHERE name IN ('部署测试20261024A', '部署测试20261024B')
  AND month = 1
  AND day = 1
  AND participation = 'unsure'
  AND created_at >= '2026-10-23T00:00:00.000Z'
  AND created_at < '2026-10-25T00:00:00.000Z';
