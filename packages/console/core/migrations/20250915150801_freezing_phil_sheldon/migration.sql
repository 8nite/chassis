ALTER TABLE `billing` ADD `last_error` varchar(255);
ALTER TABLE `billing` ADD `time_last_error` timestamp(3);
ALTER TABLE `payment` DROP COLUMN `error`;