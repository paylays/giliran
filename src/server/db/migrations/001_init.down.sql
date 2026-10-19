-- Manual rollback for 001_init.sql. Destroys all data. After running it, also run:
--   DELETE FROM schema_migrations WHERE version = '001_init';
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS daily_sequences;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS counter_services;
DROP TABLE IF EXISTS counters;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS settings;
