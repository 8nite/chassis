CREATE INDEX `workspace_user_id` ON `subscription` (`workspace_id`,`user_id`);
ALTER TABLE `user` DROP COLUMN `time_subscribed`;
ALTER TABLE `user` DROP COLUMN `sub_interval_usage`;
ALTER TABLE `user` DROP COLUMN `sub_monthly_usage`;
ALTER TABLE `user` DROP COLUMN `sub_time_interval_usage_updated`;
ALTER TABLE `user` DROP COLUMN `sub_time_monthly_usage_updated`;