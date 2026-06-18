-- Run once against the Flarum DB before first digest send.
-- mysql -h 10.106.0.8 -u flarum -p flarum < db/migrations/001_create_digest_subscribers.sql

CREATE TABLE IF NOT EXISTS digest_subscribers (
  user_id      INT          NULL,
  email        VARCHAR(255) NOT NULL,
  token        CHAR(36)     NOT NULL,
  subscribed   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email),
  UNIQUE KEY  uniq_token (token)
);
