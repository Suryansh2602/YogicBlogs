-- Healthmarg — one-time local database setup. Safe to run again (idempotent).
-- Run as MySQL root (Command Prompt):
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "source <path-to-this-file>"
--
-- BEFORE RUNNING: replace both <CHANGE_ME_...> placeholders with strong, different passwords,
-- and put the same values in backend/.env and backend/.env.test (both git-ignored). Never commit them.
-- (Locally, backend/.local/create-db-users.local.sql is this file with generated passwords filled in.)
--
-- Databases:
--   healthmarg             app data
--   healthmarg_audit       append-only audit log (app may INSERT/SELECT only)
--   healthmarg_test        test data (wiped by every DB test run)
--   healthmarg_test_audit  test audit log
--
-- Users (least privilege):
--   healthmarg_app       runtime: read/write rows, cannot change the schema, cannot edit/delete audit entries
--   healthmarg_migrator  migrations/tests only: may change the schema

CREATE DATABASE IF NOT EXISTS healthmarg            CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS healthmarg_audit      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS healthmarg_test       CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS healthmarg_test_audit CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'healthmarg_app'@'localhost'      IDENTIFIED BY '<CHANGE_ME_APP_PASSWORD>';
CREATE USER IF NOT EXISTS 'healthmarg_migrator'@'localhost' IDENTIFIED BY '<CHANGE_ME_MIGRATOR_PASSWORD>';

-- Runtime user: rows only.
GRANT SELECT, INSERT, UPDATE, DELETE ON healthmarg.*            TO 'healthmarg_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON healthmarg_test.*       TO 'healthmarg_app'@'localhost';
-- Audit: append-only for the app.
GRANT SELECT, INSERT                 ON healthmarg_audit.*      TO 'healthmarg_app'@'localhost';
GRANT SELECT, INSERT                 ON healthmarg_test_audit.* TO 'healthmarg_app'@'localhost';

-- Migrator: schema changes (DELETE on audit only so the test suite can reset it).
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON healthmarg.*            TO 'healthmarg_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON healthmarg_test.*       TO 'healthmarg_migrator'@'localhost';
GRANT SELECT, INSERT, CREATE, ALTER, DROP, INDEX                             ON healthmarg_audit.*      TO 'healthmarg_migrator'@'localhost';
GRANT SELECT, INSERT, DELETE, CREATE, ALTER, DROP, INDEX                     ON healthmarg_test_audit.* TO 'healthmarg_migrator'@'localhost';

FLUSH PRIVILEGES;
