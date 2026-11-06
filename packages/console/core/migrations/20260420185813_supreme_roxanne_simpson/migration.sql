ALTER TABLE `model_tpm_limit` DROP PRIMARY KEY;
ALTER TABLE `model_tpm_limit` ADD PRIMARY KEY (`id`);
ALTER TABLE `model_tpm_limit` DROP COLUMN `interval`;