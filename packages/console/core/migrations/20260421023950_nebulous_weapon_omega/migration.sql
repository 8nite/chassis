DROP TABLE `model_tpm_limit`;
ALTER TABLE `model_tpm_rate_limit` DROP PRIMARY KEY;
ALTER TABLE `model_tpm_rate_limit` ADD PRIMARY KEY (`id`,`interval`);