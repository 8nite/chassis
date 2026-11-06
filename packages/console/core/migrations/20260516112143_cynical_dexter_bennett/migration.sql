DROP INDEX `referral_workspace_id` ON `referral`;
ALTER TABLE `referral` DROP PRIMARY KEY;
ALTER TABLE `referral` ADD PRIMARY KEY (`workspace_id`,`id`);