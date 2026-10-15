CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- Non-superuser role used by the app so Row-Level Security is enforced.
CREATE ROLE telusur_app LOGIN PASSWORD 'telusur_app';
GRANT ALL ON SCHEMA public TO telusur_app;
