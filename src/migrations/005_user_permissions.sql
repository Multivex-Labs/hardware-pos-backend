-- Run once against each existing POS database before deploying the permissions update.
ALTER TABLE users
  ADD COLUMN permissions LONGTEXT NULL AFTER role;
