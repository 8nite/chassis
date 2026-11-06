ALTER TABLE `key` MODIFY COLUMN `user_id` varchar(30) NOT NULL;
ALTER TABLE `key` DROP COLUMN `actor`;
ALTER TABLE `key` DROP COLUMN `old_name`;