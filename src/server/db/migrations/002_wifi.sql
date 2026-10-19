-- Optional venue Wi-Fi shown as a join QR. A NULL wifi_ssid means the feature is off.
ALTER TABLE settings ADD COLUMN wifi_ssid TEXT;
ALTER TABLE settings ADD COLUMN wifi_password TEXT;
ALTER TABLE settings ADD COLUMN wifi_security TEXT NOT NULL DEFAULT 'WPA' CHECK (wifi_security IN ('WPA', 'WEP', 'nopass'));
