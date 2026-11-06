ALTER TABLE `billing` ADD `subscription_id` varchar(28);
ALTER TABLE `usage` ADD `data` json;
ALTER TABLE `user` ADD `time_subscribed` timestamp(3);
ALTER TABLE `user` ADD `sub_recent_usage` bigint;
ALTER TABLE `user` ADD `sub_monthly_usage` bigint;
ALTER TABLE `user` ADD `sub_time_recent_usage_updated` timestamp(3);
ALTER TABLE `user` ADD `sub_time_monthly_usage_updated` timestamp(3);