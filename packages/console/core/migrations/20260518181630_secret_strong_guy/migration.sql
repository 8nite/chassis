DROP INDEX `workspace_referral_code` ON `workspace`;
CREATE UNIQUE INDEX `referral_code` ON `workspace` (`referral_code`);