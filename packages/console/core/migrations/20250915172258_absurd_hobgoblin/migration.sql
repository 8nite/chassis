ALTER TABLE `billing` RENAME COLUMN `last_error` TO `reload_error`;
ALTER TABLE `billing` RENAME COLUMN `time_last_error` TO `time_reload_error`;