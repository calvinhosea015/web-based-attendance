const bcrypt = require('bcryptjs');
const { query } = require('./pool');

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS offices (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    link TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    shift_name VARCHAR(255) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration INTEGER NOT NULL DEFAULT 60
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    position_id INTEGER REFERENCES positions(id),
    salary_type VARCHAR(32) NOT NULL DEFAULT 'monthly',
    basic_salary NUMERIC(14,2) DEFAULT 0,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'active'
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'employee')),
    office_id INTEGER REFERENCES offices(id),
    employee_id INTEGER UNIQUE REFERENCES employees(id)
  )`,
  `CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (employee_id, effective_from)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    office_id INTEGER NOT NULL REFERENCES offices(id),
    check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out TIMESTAMPTZ,
    work_hours NUMERIC(10,2),
    overtime_hours NUMERIC(10,2) DEFAULT 0,
    late_minutes INTEGER DEFAULT 0,
    attendance_status VARCHAR(64) NOT NULL DEFAULT 'PRESENT',
    lat_in DOUBLE PRECISION,
    lng_in DOUBLE PRECISION,
    lat_out DOUBLE PRECISION,
    lng_out DOUBLE PRECISION,
    gps_accuracy_in_m DOUBLE PRECISION,
    gps_accuracy_out_m DOUBLE PRECISION,
    client_ts_in BIGINT,
    client_ts_out BIGINT,
    ip_in VARCHAR(64),
    ip_out VARCHAR(64),
    user_agent_in TEXT,
    user_agent_out TEXT,
    validation_flags JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_employee_checkin ON attendance(employee_id, check_in DESC)`,
  `CREATE TABLE IF NOT EXISTS payroll (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    payroll_period VARCHAR(32) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    overtime_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
    final_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, payroll_period)
  )`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    days_count NUMERIC(6,2) NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS leave_balances (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(64) NOT NULL,
    balance_days NUMERIC(8,2) NOT NULL DEFAULT 0,
    UNIQUE (employee_id, leave_type)
  )`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    user_agent TEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id),
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64),
    resource_id VARCHAR(64),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    method VARCHAR(16) NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,
    ip_address VARCHAR(64),
    user_agent TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    scope VARCHAR(32) NOT NULL DEFAULT 'user',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS overtime_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    hours_requested NUMERIC(8,2) NOT NULL,
    reason TEXT,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    decided_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_correction_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    requested_changes JSONB DEFAULT '{}'::jsonb,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    decided_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

async function migrateEnterpriseColumns() {
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_status VARCHAR(32) DEFAULT 'active'`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS remote_work_allowed BOOLEAN NOT NULL DEFAULT true`
  );
}

async function syncEmployeeCodeSequence() {
  await query(`CREATE SEQUENCE IF NOT EXISTS employee_code_seq`);
  await query(`
    SELECT setval(
      'employee_code_seq',
      COALESCE((
        SELECT MAX((regexp_match(employee_id, '^EMP([0-9]+)$'))[1]::bigint)
        FROM employees
        WHERE employee_id ~ '^EMP[0-9]+$'
      ), 0)::bigint,
      true
    )
  `);
}

async function seed() {
  const adminHash = bcrypt.hashSync('Admin123!Secure', 12);
  await query(
    `INSERT INTO departments (name) VALUES ('General')
     ON CONFLICT (name) DO NOTHING`
  );
  await query(
    `INSERT INTO positions (title) VALUES ('Staff')
     ON CONFLICT (title) DO NOTHING`
  );
  const dept = await query(`SELECT id FROM departments WHERE name = 'General' LIMIT 1`);
  const pos = await query(`SELECT id FROM positions WHERE title = 'Staff' LIMIT 1`);
  const departmentId = dept.rows[0].id;
  const positionId = pos.rows[0].id;

  const off = await query(`SELECT id FROM offices WHERE name = 'rs darmo' LIMIT 1`);
  if (off.rows.length === 0) {
    await query(
      `INSERT INTO offices (name, lat, lng, link) VALUES
       ('rs darmo', -7.287414, 112.73766, 'https://maps.app.goo.gl/x9nEcHGRREfzCiwC9')`
    );
  }

  await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ('admin', $1, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [adminHash]
  );

  const demoEmp = await query(`SELECT id FROM employees WHERE employee_id = 'EMP001' LIMIT 1`);
  let employeeId;
  if (demoEmp.rows.length === 0) {
    const ins = await query(
      `INSERT INTO employees (employee_id, full_name, department_id, position_id, salary_type, basic_salary, join_date, status)
       VALUES ('EMP001', 'Demo Employee', $1, $2, 'monthly', 5000000, CURRENT_DATE, 'active')
       RETURNING id`,
      [departmentId, positionId]
    );
    employeeId = ins.rows[0].id;
    const userHash = bcrypt.hashSync('Employee123!Secure', 12);
    await query(
      `INSERT INTO users (username, password_hash, role, employee_id, office_id)
       VALUES ('employee', $1, 'employee', $2, (SELECT id FROM offices ORDER BY id LIMIT 1))
       ON CONFLICT (username) DO NOTHING`,
      [userHash, employeeId]
    );
  }
}

async function migrate() {
  for (const sql of SCHEMA_STATEMENTS) {
    await query(sql);
  }
  await migrateEnterpriseColumns();
  await seed();
  await syncEmployeeCodeSequence();
}

module.exports = { migrate };
