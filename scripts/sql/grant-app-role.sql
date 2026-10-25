-- Grants for the restricted runtime role used by the Worker (through Hyperdrive).
-- Run as the migration/owner role after migrations have been applied. Safe to re-run.
--
--   psql "$MIGRATION_DATABASE_URL" -v app_role=trabaho_app -f scripts/sql/grant-app-role.sql
--
-- The runtime role can read, add and change rows but cannot change the schema,
-- and can delete only what the application itself deletes.

GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

-- Tables created by future migrations (run by this owner role) get the same,
-- without DELETE: grant that per table below when the application needs it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE DELETE ON TABLES FROM :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- DELETE only where the application deletes: ended sign-in sessions and
-- tokens, and applications (their files go with them) after the retention
-- period or on request. Without DELETE on jobs or users, nothing can cascade
-- into the history tables below.
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM :"app_role";
GRANT DELETE ON public.sessions, public.verifications, public.applications TO :"app_role";

-- History tables are append-only for the application.
REVOKE UPDATE, DELETE ON public.audit_events FROM :"app_role";
REVOKE UPDATE, DELETE ON public.job_events FROM :"app_role";
