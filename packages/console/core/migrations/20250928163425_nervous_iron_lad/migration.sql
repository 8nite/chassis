ALTER TABLE `user` ADD `time_joined` timestamp(3);
ALTER TABLE `user` ADD `role` enum('admin','member');