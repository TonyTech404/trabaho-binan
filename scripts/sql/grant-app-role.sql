-- Grants for the restricted runtime role used by the Worker (through Hyperdrive).
-- Run as the migration/owner role after migrations have been applied. Safe to re-run.
--
--   psql "$MIGRATION_DATABASE_URL" -v app_role=trabaho_app -f scripts/sql/grant-app-role.sql
--
-- The runtime role can read and write rows but cannot change the schema.

GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

-- Tables created by future migrations (run by this owner role) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- History tables are append-only for the application.
REVOKE UPDATE, DELETE ON public.audit_events FROM :"app_role";
REVOKE UPDATE, DELETE ON public.job_events FROM :"app_role";
