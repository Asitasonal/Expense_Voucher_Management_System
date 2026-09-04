PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'DIRECTOR', 'ACCOUNTS')),
  department TEXT,
  employee_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_date TEXT,
  expense_date TEXT,
  department_name TEXT,
  expense_title TEXT,
  expense_category TEXT,
  expense_description TEXT,
  amount REAL,
  employee_id INTEGER NOT NULL,
  employee_name TEXT,
  employee_code TEXT,
  employee_signature TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  director_signature TEXT,
  approval_date TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_employee_id ON vouchers(employee_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
