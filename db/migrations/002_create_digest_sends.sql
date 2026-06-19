-- Run once on the production DB:
-- mysql -h 10.106.0.8 -u flarum -pflarum123 flarum < db/migrations/002_create_digest_sends.sql

CREATE TABLE IF NOT EXISTS digest_sends (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255) NOT NULL,
  resend_id    VARCHAR(100) NOT NULL,
  run_date     DATE         NOT NULL,
  sent_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP    NULL,
  opened_at    TIMESTAMP    NULL,
  open_count   INT          NOT NULL DEFAULT 0,
  UNIQUE KEY   uniq_resend_id (resend_id),
  INDEX        idx_email    (email),
  INDEX        idx_run_date (run_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
