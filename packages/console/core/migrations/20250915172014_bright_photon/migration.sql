ALTER TABLE `billing` ADD `monthly_limit` int;
ALTER TABLE `billing` ADD `monthly_usage` bigint;
ALTER TABLE `billing` ADD `time_monthly_usage_updated` timestamp(3);