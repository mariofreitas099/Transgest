-- ================================================================
-- TRANSGEST — SCHEMA SUPABASE
-- Executa este ficheiro no SQL Editor do teu projeto Supabase
-- ================================================================

-- ── EXTENSÕES ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- TABELAS
-- ================================================================

-- COMPANIES (multi-tenant: cada empresa tem os seus dados isolados)
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  nif         TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  vat_rate    INT DEFAULT 23,
  pay_days    INT DEFAULT 30,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- PROFILES (extensão de auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  full_name   TEXT,
  role        TEXT DEFAULT 'owner', -- owner | manager | driver
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  nif         TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- DRIVERS
CREATE TABLE IF NOT EXISTS drivers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  license     TEXT DEFAULT 'B',
  status      TEXT DEFAULT 'disponível',
  join_date   DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plate        TEXT NOT NULL,
  model        TEXT NOT NULL,
  type         TEXT DEFAULT 'Carrinha Média',
  status       TEXT DEFAULT 'disponível',
  year         INT,
  km           INT DEFAULT 0,
  next_service DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICES
CREATE TABLE IF NOT EXISTS services (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  driver_id    UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id   UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  type         TEXT DEFAULT 'mudança',
  status       TEXT DEFAULT 'pendente',
  date         DATE NOT NULL,
  time         TIME NOT NULL,
  origin       TEXT NOT NULL,
  destination  TEXT NOT NULL,
  price        NUMERIC(10,2) DEFAULT 0,
  notes        TEXT,
  start_time   TIME,
  end_time     TIME,
  km           INT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES services(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  number      TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  vat_rate    INT DEFAULT 23,
  date        DATE DEFAULT CURRENT_DATE,
  due_date    DATE,
  status      TEXT DEFAULT 'pendente',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id  UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  category    TEXT DEFAULT 'combustível',
  amount      NUMERIC(10,2) NOT NULL,
  date        DATE DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ÍNDICES (performance)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_services_company    ON services(company_id);
CREATE INDEX IF NOT EXISTS idx_services_date       ON services(date);
CREATE INDEX IF NOT EXISTS idx_services_status     ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_driver     ON services(driver_id);
CREATE INDEX IF NOT EXISTS idx_clients_company     ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_company     ON drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_company    ON vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company    ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company    ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date       ON expenses(date);

-- ================================================================
-- TRIGGERS — updated_at automático
-- ================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated   BEFORE UPDATE ON clients   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_drivers_updated   BEFORE UPDATE ON drivers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated  BEFORE UPDATE ON vehicles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_services_updated  BEFORE UPDATE ON services  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated  BEFORE UPDATE ON invoices  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================
-- TRIGGER — criar profile automaticamente ao registar utilizador
-- ================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- ROW LEVEL SECURITY (RLS)
-- Garante que cada empresa só acede aos seus próprios dados
-- ================================================================

ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;

-- Helper function: retorna company_id do utilizador autenticado
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- COMPANIES: só o próprio pode ler/editar a sua empresa
CREATE POLICY "company_select" ON companies FOR SELECT USING (id = my_company_id());
CREATE POLICY "company_update" ON companies FOR UPDATE USING (id = my_company_id());

-- PROFILES: só o próprio perfil
CREATE POLICY "profile_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profile_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- CLIENTS
CREATE POLICY "clients_all" ON clients FOR ALL USING (company_id = my_company_id());

-- DRIVERS
CREATE POLICY "drivers_all" ON drivers FOR ALL USING (company_id = my_company_id());

-- VEHICLES
CREATE POLICY "vehicles_all" ON vehicles FOR ALL USING (company_id = my_company_id());

-- SERVICES
CREATE POLICY "services_all" ON services FOR ALL USING (company_id = my_company_id());

-- INVOICES
CREATE POLICY "invoices_all" ON invoices FOR ALL USING (company_id = my_company_id());

-- EXPENSES
CREATE POLICY "expenses_all" ON expenses FOR ALL USING (company_id = my_company_id());

-- ================================================================
-- REALTIME (ativa subscriptions para serviços e motoristas)
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE services;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;

-- ================================================================
-- FIM DO SCHEMA
-- ================================================================
