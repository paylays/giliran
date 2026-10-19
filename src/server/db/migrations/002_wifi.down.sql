-- Manual rollback for 002_wifi.sql. Drops the saved Wi-Fi details. After running it, also run:
--   DELETE FROM schema_migrations WHERE version = '002_wifi';
ALTER TABLE settings DROP COLUMN wifi_security;
ALTER TABLE settings DROP COLUMN wifi_password;
ALTER TABLE settings DROP COLUMN wifi_ssid;
