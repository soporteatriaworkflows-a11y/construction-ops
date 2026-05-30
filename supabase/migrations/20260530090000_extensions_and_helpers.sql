-- Migration: extensions, helper functions y trigger de updated_at
-- Agent: agent-db-rls
-- Atómica: prepara el terreno común para todas las tablas.
--
-- UP

-- pgcrypto provee gen_random_uuid() (PK por defecto en todas las tablas).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Esquema dedicado para helpers de la aplicación.
CREATE SCHEMA IF NOT EXISTS app;

-- ---------------------------------------------------------------------------
-- app.current_org(): organización del usuario autenticado.
--
-- Lee el claim 'organization_id' del JWT de Supabase (request.jwt.claims).
-- Es la base de toda política RLS por organización. Si no hay claim (sesión
-- sin organización), retorna NULL y las políticas no exponen ninguna fila.
--
-- STABLE: el valor no cambia dentro de una misma sentencia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_org()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id',
    ''
  )::uuid;
$$;

-- ---------------------------------------------------------------------------
-- app.current_role(): rol de la aplicación del usuario autenticado.
-- Lee el claim 'user_role' del JWT (no confundir con el ROLE de Postgres).
-- Usado por políticas que restringen acciones a 'admin'/'gerencia'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'user_role',
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- app.set_updated_at(): trigger BEFORE UPDATE que refresca updated_at.
-- Único trigger "controlado" del esquema: solo auditoría, sin lógica de
-- negocio (regla de ownership de agent-db-rls).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- DOWN
-- DROP FUNCTION IF EXISTS app.set_updated_at();
-- DROP FUNCTION IF EXISTS app.current_role();
-- DROP FUNCTION IF EXISTS app.current_org();
-- DROP SCHEMA IF EXISTS app;
-- -- pgcrypto se deja instalada (puede usarla otro objeto).
