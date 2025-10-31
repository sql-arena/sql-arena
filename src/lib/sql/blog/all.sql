SELECT title, slug, strftime(publish_date, '%Y-%m-%d') AS publish_date
FROM fact_blog
ORDER BY publish_date DESC;