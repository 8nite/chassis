CREATE TABLE `referral_code` (
	`workspace_id` varchar(30) PRIMARY KEY,
	`code` varchar(10) NOT NULL,
	`time_created` timestamp(3) NOT NULL DEFAULT (now()),
	`time_updated` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`time_deleted` timestamp(3),
	CONSTRAINT `code` UNIQUE INDEX(`code`)
);

DROP INDEX `referral_invitee_account_id` ON `referral`;
DROP INDEX `referral_code` ON `workspace`;
CREATE UNIQUE INDEX `invitee_account_id` ON `referral` (`invitee_account_id`);
ALTER TABLE `workspace` DROP COLUMN `referral_code`;
