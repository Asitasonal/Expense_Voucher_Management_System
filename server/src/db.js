const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'voucher_management.db');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('EMPLOYEE', 'DIRECTOR', 'ACCOUNTS')),
          department TEXT,
          employee_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
      });

      db.run(`
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
        )
      `, (err) => {
        if (err) return reject(err);
      });

      const seedUsers = [
        {
          name: 'Employee User',
          email: 'employee@abc.com',
          password: 'employee123',
          role: 'EMPLOYEE',
          department: 'Operations',
          employee_id: 'EMP-101'
        },
        {
          name: 'Director User',
          email: 'director@abc.com',
          password: 'director123',
          role: 'DIRECTOR',
          department: 'Management',
          employee_id: 'DIR-01'
        },
        {
          name: 'Accounts User',
          email: 'accounts@abc.com',
          password: 'accounts123',
          role: 'ACCOUNTS',
          department: 'Finance',
          employee_id: 'ACC-01'
        }
      ];

      db.get('SELECT COUNT(*) as total FROM users', (countErr, row) => {
        if (countErr) {
          reject(countErr);
          return;
        }

        if (Number(row.total) === 0) {
          seedUsers.forEach((user) => {
            const passwordHash = bcrypt.hashSync(user.password, 10);
            db.run(
              'INSERT INTO users (name, email, password_hash, role, department, employee_id) VALUES (?, ?, ?, ?, ?, ?)',
              [user.name, user.email, passwordHash, user.role, user.department, user.employee_id]
            );
          });
        }

        db.get('SELECT COUNT(*) as total FROM vouchers', (voucherErr, voucherRow) => {
          if (voucherErr) {
            reject(voucherErr);
            return;
          }

          if (Number(voucherRow.total) === 0) {
            const employeeId = 1;
            const now = new Date().toISOString();
            db.run(
              `INSERT INTO vouchers (
                voucher_number, voucher_date, expense_date, department_name, expense_title,
                expense_category, expense_description, amount, employee_id, employee_name,
                employee_code, employee_signature, status, director_signature, approval_date,
                rejection_reason, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                'VCH-20260903-0001',
                now,
                '2026-09-02',
                'Operations',
                'Client Travel',
                'Travel',
                'Travel reimbursement for client visit.',
                2500,
                employeeId,
                'Employee User',
                'EMP-101',
                null,
                'SUBMITTED',
                null,
                null,
                null,
                now,
                now
              ]
            );
          }

          resolve();
        });
      });
    });
  });
};

module.exports = { db, initDatabase };
