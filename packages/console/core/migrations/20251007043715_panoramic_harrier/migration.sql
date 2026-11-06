ALTER TABLE `user` ADD `monthly_limit` int;
ALTER TABLE `user` ADD `monthly_usage` bigint;
ALTER TABLE `user` ADD `time_monthly_usage_updated` timestamp(3);