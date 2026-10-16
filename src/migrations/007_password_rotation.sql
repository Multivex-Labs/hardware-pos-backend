-- Run once against each existing POS database before deploying password rotation.
ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER permissions;
