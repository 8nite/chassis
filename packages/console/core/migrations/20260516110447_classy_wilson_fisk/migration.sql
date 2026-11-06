DROP INDEX `referral_reward_workspace_time` ON `referral_reward`;
ALTER TABLE `referral_reward` DROP PRIMARY KEY;
ALTER TABLE `referral_reward` ADD PRIMARY KEY (`workspace_id`,`referral_id`);
ALTER TABLE `referral_reward` DROP COLUMN `id`;