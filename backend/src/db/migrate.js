const bcrypt = require('bcryptjs');
const { query } = require('./pool');
const { PABRIK_CATALOG } = require('../constants/pabrikCatalog');

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
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'employee', 'field_officer', 'umum', 'accounting', 'general_affairs', 'head_of_finance')),
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

async function migratePayrollColumns() {
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS tunjangan_masa_kerja NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS transport_eligible BOOLEAN NOT NULL DEFAULT false`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS payroll_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      transport_amount NUMERIC(14,2) NOT NULL DEFAULT 250000,
      diligence_amount NUMERIC(14,2) NOT NULL DEFAULT 100000,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await query(
    `INSERT INTO payroll_settings (id, transport_amount, diligence_amount)
     VALUES (1, 250000, 100000)
     ON CONFLICT (id) DO NOTHING`
  );
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS days_attended INTEGER NOT NULL DEFAULT 0`);
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS tunjangan_masa_kerja NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS transport_eligible BOOLEAN NOT NULL DEFAULT false`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS insentif NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS diligence_eligible BOOLEAN NOT NULL DEFAULT false`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS diligence_bonus NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS bonus_omset NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS upah_harian NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS upah_harian NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS expected_work_days INTEGER`);
}

async function migrateLoanRequests() {
  await query(
    `CREATE TABLE IF NOT EXISTS loan_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      loan_amount NUMERIC(14,2) NOT NULL,
      monthly_deduction NUMERIC(14,2) NOT NULL,
      notes TEXT,
      approval_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      decided_by INTEGER REFERENCES users(id),
      decided_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_loan_requests_employee ON loan_requests(employee_id, created_at DESC)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_loan_requests_pending ON loan_requests(approval_status) WHERE approval_status = 'pending'`
  );
}

async function migratePayrollLoanColumns() {
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS transport_allowance_amount NUMERIC(14,2) NOT NULL DEFAULT 250000`
  );
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS diligence_allowance_amount NUMERIC(14,2) NOT NULL DEFAULT 100000`
  );
  await query(
    `ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2)`
  );
  await query(
    `UPDATE loan_requests SET remaining_balance = loan_amount
     WHERE approval_status = 'approved' AND remaining_balance IS NULL`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS late_deduction NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS pph_21 NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS default_upah_harian NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS absence_deduction NUMERIC(14,2)`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS bpjs_tk NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS bpjs_kes NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `UPDATE payroll SET other_deductions = deductions
     WHERE other_deductions = 0 AND deductions > 0`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS loan_payroll_deductions (
      id SERIAL PRIMARY KEY,
      loan_request_id INTEGER NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
      payroll_period VARCHAR(32) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (loan_request_id, payroll_period)
    )`
  );
}

async function migratePayrollKeteranganColumn() {
  await query(`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS keterangan TEXT NOT NULL DEFAULT ''`);
}

async function migrateEnterpriseColumns() {
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_status VARCHAR(32) DEFAULT 'active'`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS remote_work_allowed BOOLEAN NOT NULL DEFAULT true`
  );
  await query(
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS daily_segments INTEGER NOT NULL DEFAULT 1`
  );
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS segment1_start TIME`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS segment1_end TIME`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS segment2_start TIME`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS segment2_end TIME`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS birthday DATE`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_work_start TIME`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_work_end TIME`);
}

/** Default shift 07:15–16:00 and assign to employees who have no shift row yet. */
async function ensureDefaultShift() {
  let r = await query(`SELECT id FROM shifts WHERE shift_name = 'Standard 7–4' LIMIT 1`);
  let shiftId;
  if (r.rows.length === 0) {
    const ins = await query(
      `INSERT INTO shifts (shift_name, start_time, end_time, break_duration)
       VALUES ('Standard 7–4', TIME '07:15', TIME '16:00', 60)
       RETURNING id`
    );
    shiftId = ins.rows[0].id;
  } else {
    shiftId = r.rows[0].id;
    await query(
      `UPDATE shifts SET start_time = TIME '07:15', end_time = TIME '16:00', break_duration = 60 WHERE id = $1`,
      [shiftId]
    );
  }
  await query(
    `INSERT INTO employee_shifts (employee_id, shift_id, effective_from)
     SELECT e.id, $1, DATE '1970-01-01' FROM employees e
     WHERE NOT EXISTS (SELECT 1 FROM employee_shifts es WHERE es.employee_id = e.id)`,
    [shiftId]
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
  const adminHash = bcrypt.hashSync('Admin123456', 12);
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
    const userHash = bcrypt.hashSync('Employee123456', 12);
    await query(
      `INSERT INTO users (username, password_hash, role, employee_id, office_id)
       VALUES ('employee', $1, 'employee', $2, (SELECT id FROM offices ORDER BY id LIMIT 1))
       ON CONFLICT (username) DO NOTHING`,
      [userHash, employeeId]
    );
  }
}

/** Allow pegawai (employee) and petugas lapangan (field_officer) roles on existing DBs. */
async function migrateUserRoleConstraint() {
  const r = await query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'users'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%role%'
  `);
  for (const row of r.rows) {
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
  await query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'employee', 'field_officer', 'umum', 'accounting', 'general_affairs', 'head_of_finance'))
  `);
}

/** All staff: one check-in and one check-out per day (no split-shift / four-clock mode). */
async function normalizeEmployeeClockMode() {
  await query(`UPDATE employees SET daily_segments = 1`);
  await query(`
    UPDATE employees SET
      segment1_start = NULL,
      segment1_end = NULL,
      segment2_start = NULL,
      segment2_end = NULL
  `);
}

async function migrateAttendanceCheckoutCode() {
  await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_code TEXT`);
  await query(
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER NOT NULL DEFAULT 0`
  );
}

async function migrateLeaveFeatures() {
  await query(
    `CREATE TABLE IF NOT EXISTS leave_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      medical_days_per_year NUMERIC(8,2) NOT NULL DEFAULT 12,
      unpaid_days_per_year NUMERIC(8,2) NOT NULL DEFAULT 0,
      paternity_days_per_year NUMERIC(8,2) NOT NULL DEFAULT 2,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await query(
    `INSERT INTO leave_settings (id, medical_days_per_year, unpaid_days_per_year, paternity_days_per_year)
     VALUES (1, 12, 0, 2)
     ON CONFLICT (id) DO NOTHING`
  );
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_path TEXT`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reason TEXT`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id, created_at DESC)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_leave_requests_pending ON leave_requests(approval_status) WHERE approval_status = 'pending'`
  );
  await query(
    `ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_paid BOOLEAN`
  );
  await query(
    `UPDATE leave_requests SET is_paid = true
     WHERE approval_status = 'approved' AND leave_type = 'medical' AND is_paid IS NULL`
  );
  await query(
    `UPDATE leave_requests SET is_paid = false
     WHERE approval_status = 'approved' AND leave_type = 'unpaid' AND is_paid IS NULL`
  );
  await query(
    `UPDATE leave_requests SET is_paid = false
     WHERE approval_status = 'approved' AND leave_type = 'paternity' AND is_paid IS NULL`
  );
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_data BYTEA`);
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(128)`);
}

async function migrateFieldCheckoutTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS field_code_entries (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      valid_on DATE NOT NULL,
      attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, valid_on)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_field_code_entries_date ON field_code_entries(valid_on DESC)`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS pabrik_item_rates (
      id SERIAL PRIMARY KEY,
      pabrik_code VARCHAR(32) NOT NULL,
      kode_barang VARCHAR(64) NOT NULL,
      tonase_per_item NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (tonase_per_item >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pabrik_code, kode_barang)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS field_delivery_entries (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      valid_on DATE NOT NULL,
      checkout_code TEXT NOT NULL,
      pabrik_code VARCHAR(32) NOT NULL,
      norek VARCHAR(5) NOT NULL,
      nomor_tanda_terima BIGINT NOT NULL,
      nomor_surat_jalan BIGINT NOT NULL,
      nopol VARCHAR(32) NOT NULL,
      no_bs BIGINT NOT NULL,
      kode_barang VARCHAR(64) NOT NULL,
      kotor NUMERIC(14,2) NOT NULL,
      berat_bersih NUMERIC(14,2) NOT NULL,
      selisih NUMERIC(14,2) NOT NULL,
      tonase_per_item NUMERIC(14,4) NOT NULL DEFAULT 0,
      bonus_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      omset_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(
    `ALTER TABLE field_delivery_entries ADD COLUMN IF NOT EXISTS omset_amount NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `UPDATE field_delivery_entries
     SET omset_amount = ROUND((tonase_per_item * selisih)::numeric, 2)
     WHERE omset_amount = 0 AND tonase_per_item > 0 AND selisih > 0`
  );
  await query(
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS omset_total NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_field_delivery_employee_date
     ON field_delivery_entries(employee_id, valid_on)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_field_delivery_valid_on ON field_delivery_entries(valid_on DESC)`
  );
  await query(
    `ALTER TABLE pabrik_item_rates ADD COLUMN IF NOT EXISTS price_per_item NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price_per_item >= 0)`
  );
  await query(
    `ALTER TABLE field_delivery_entries ADD COLUMN IF NOT EXISTS price_per_item NUMERIC(14,2) NOT NULL DEFAULT 0`
  );
}

async function migrateEmployeeOffices() {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_offices (
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      PRIMARY KEY (employee_id, office_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_employee_offices_office ON employee_offices(office_id)`
  );
  await query(
    `INSERT INTO employee_offices (employee_id, office_id)
     SELECT u.employee_id, u.office_id
     FROM users u
     WHERE u.role = 'field_officer'
       AND u.employee_id IS NOT NULL
       AND u.office_id IS NOT NULL
     ON CONFLICT DO NOTHING`
  );
}

async function migratePabrikCatalog() {
  await query(`
    CREATE TABLE IF NOT EXISTS pabriks (
      id SERIAL PRIMARY KEY,
      pabrik_code VARCHAR(32) NOT NULL UNIQUE,
      nama_pabrik VARCHAR(255) NOT NULL,
      google_maps_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_pabriks_sort ON pabriks(sort_order ASC, pabrik_code ASC)`
  );
  await query(
    `ALTER TABLE pabriks ADD COLUMN IF NOT EXISTS office_id INTEGER REFERENCES offices(id) ON DELETE SET NULL`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_pabriks_office ON pabriks(office_id) WHERE office_id IS NOT NULL`
  );

  for (const row of PABRIK_CATALOG) {
    await query(
      `INSERT INTO pabriks (pabrik_code, nama_pabrik, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (pabrik_code) DO UPDATE SET
         nama_pabrik = EXCLUDED.nama_pabrik,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [row.code, row.name, row.sort_order]
    );
    for (const kode of row.items) {
      await query(
        `INSERT INTO pabrik_item_rates (pabrik_code, kode_barang, tonase_per_item)
         VALUES ($1, $2, 0)
         ON CONFLICT (pabrik_code, kode_barang) DO NOTHING`,
        [row.code, kode]
      );
    }
  }
}

async function migrateEmployeePabriks() {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_pabriks (
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      pabrik_id INTEGER NOT NULL REFERENCES pabriks(id) ON DELETE CASCADE,
      PRIMARY KEY (employee_id, pabrik_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_employee_pabriks_pabrik ON employee_pabriks(pabrik_id)`
  );
}

async function migrate() {
  for (const sql of SCHEMA_STATEMENTS) {
    await query(sql);
  }
  await migrateUserRoleConstraint();
  await migrateEnterpriseColumns();
  await migrateAttendanceCheckoutCode();
  await migrateFieldCheckoutTables();
  await migrateEmployeeOffices();
  await migratePabrikCatalog();
  await migrateEmployeePabriks();
  await migrateLeaveFeatures();
  await normalizeEmployeeClockMode();
  await migratePayrollColumns();
  await migrateLoanRequests();
  await migratePayrollLoanColumns();
  await migratePayrollKeteranganColumn();
  await seed();
  await syncEmployeeCodeSequence();
  await ensureDefaultShift();
}

module.exports = { migrate };
