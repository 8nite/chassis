CREATE TABLE `blob` (
	`id` text PRIMARY KEY,
	`data` blob NOT NULL
);

CREATE TABLE `document` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
