ALTER TABLE `account` DROP INDEX `email`;
CREATE INDEX `account_id` ON `auth` (`account_id`);
ALTER TABLE `account` DROP COLUMN `email`;