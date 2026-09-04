const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { db, initDatabase } = require('./db');
const { authMiddleware, requireRole, getToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const uploadsDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

app.get('/', (_req, res) => {
  res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
});

const normalizeVoucher = (voucher) => ({
  ...voucher,
  amount: Number(voucher.amount || 0),
  employeeSignature: voucher.employee_signature || null,
  directorSignature: voucher.director_signature || null,
  employeeCode: voucher.employee_code || null,
  voucherDate: voucher.voucher_date || null,
  expenseDate: voucher.expense_date || null,
  departmentName: voucher.department_name || '',
  expenseTitle: voucher.expense_title || '',
  expenseCategory: voucher.expense_category || '',
  expenseDescription: voucher.expense_description || '',
  employeeName: voucher.employee_name || '',
  approvalDate: voucher.approval_date || null,
  rejectionReason: voucher.rejection_reason || null,
  createdAt: voucher.created_at || null,
  updatedAt: voucher.updated_at || null
});

const buildVoucherNumber = async () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `VCH-${datePart}-`;
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total FROM vouchers WHERE voucher_number LIKE ?', [`${base}%`], (err, row) => {
      if (err) return reject(err);
      const next = Number(row.total || 0) + 1;
      resolve(`${base}${String(next).padStart(4, '0')}`);
    });
  });
};

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'EMPLOYEE', department = '', employee_id = '' } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();
  const normalizedPassword = String(password || '');

  if (!normalizedName || !normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (normalizedPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  const validRoles = ['EMPLOYEE', 'DIRECTOR', 'ACCOUNTS'];
  if (!validRoles.includes(String(role).toUpperCase())) {
    return res.status(400).json({ message: 'Invalid role selected.' });
  }

  db.get('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail], (err, existingUser) => {
    if (err) return res.status(500).json({ message: 'Database error while registering user.' });
    if (existingUser) return res.status(409).json({ message: 'An account with this email already exists.' });

    const passwordHash = bcrypt.hashSync(normalizedPassword, 10);

    db.run(
      'INSERT INTO users (name, email, password_hash, role, department, employee_id) VALUES (?, ?, ?, ?, ?, ?)',
      [normalizedName, normalizedEmail, passwordHash, String(role).toUpperCase(), String(department || '').trim(), String(employee_id || '').trim() || null],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ message: 'Unable to create account.' });

        db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (userErr, user) => {
          if (userErr || !user) return res.status(500).json({ message: 'Account created but could not be loaded.' });

          const token = getToken(user);
          const { password_hash, ...safeUser } = user;
          res.status(201).json({ token, user: safeUser, message: 'Account created successfully.' });
        });
      }
    );
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error while logging in.' });
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

    const valid = bcrypt.compareSync(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = getToken(user);
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and new password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.run(
    'UPDATE users SET password_hash = ? WHERE LOWER(email) = ?',
    [passwordHash, normalizedEmail],
    function (err) {
      if (err) return res.status(500).json({ message: 'Unable to reset password.' });
      if (this.changes === 0) return res.status(404).json({ message: 'No account found with that email.' });
      res.json({ message: 'Password reset successfully. You can now log in.' });
    }
  );
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

app.get('/api/vouchers', authMiddleware, (req, res) => {
  const { role, id } = req.user;
  const queries = [];

  let sql = `
    SELECT v.*, u.name as employee_name, u.department as employee_department, u.employee_id as employee_code
    FROM vouchers v
    LEFT JOIN users u ON u.id = v.employee_id
  `;

  if (role === 'EMPLOYEE') {
    sql += ' WHERE v.employee_id = ?';
    queries.push(id);
  }

  sql += ' ORDER BY v.created_at DESC';

  db.all(sql, queries, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Unable to load vouchers.' });
    }

    res.json({ vouchers: rows.map(normalizeVoucher) });
  });
});

app.get('/api/vouchers/:id', authMiddleware, (req, res) => {
  const { role, id: userId } = req.user;

  db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to load voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });

    if (role === 'EMPLOYEE' && voucher.employee_id !== userId) {
      return res.status(403).json({ message: 'You can only view your own vouchers.' });
    }

    res.json({ voucher: normalizeVoucher(voucher) });
  });
});

app.post('/api/vouchers', authMiddleware, requireRole('EMPLOYEE'), upload.single('employeeSignature'), async (req, res) => {
  try {
    const payload = req.body;
    const requiredFields = ['voucherDate', 'expenseDate', 'departmentName', 'expenseTitle', 'expenseCategory', 'amount'];
    const missing = requiredFields.filter((field) => !payload[field] || String(payload[field]).trim() === '');

    if (missing.length > 0) {
      return res.status(400).json({ message: 'Please provide all required voucher fields.' });
    }

    const parsedAmount = Number(payload.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero.' });
    }

    if (payload.status !== 'DRAFT' && !req.file && !payload.employeeSignature) {
      return res.status(400).json({ message: 'Employee signature is required before submitting a voucher.' });
    }

    const voucherNumber = await buildVoucherNumber();
    const employeeSignaturePath = req.file ? `/uploads/${req.file.filename}` : payload.employeeSignature;

    const values = [
      voucherNumber,
      payload.voucherDate,
      payload.expenseDate,
      payload.departmentName,
      payload.expenseTitle,
      payload.expenseCategory,
      payload.expenseDescription || '',
      parsedAmount,
      req.user.id,
      req.user.name,
      req.user.employee_id || '',
      employeeSignaturePath,
      payload.status || 'DRAFT',
      null,
      null,
      null,
      null,
      new Date().toISOString(),
      new Date().toISOString()
    ];

    db.run(
      `INSERT INTO vouchers (
        voucher_number, voucher_date, expense_date, department_name, expense_title,
        expense_category, expense_description, amount, employee_id, employee_name,
        employee_code, employee_signature, status, director_signature, approval_date,
        rejection_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values,
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Unable to create voucher.' });
        }

        db.get('SELECT * FROM vouchers WHERE id = ?', [this.lastID], (queryErr, savedVoucher) => {
          if (queryErr) return res.status(500).json({ message: 'Voucher created but could not be loaded.' });
          res.status(201).json({ voucher: normalizeVoucher(savedVoucher), message: 'Voucher saved successfully.' });
        });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unexpected error while creating voucher.' });
  }
});

app.put('/api/vouchers/:id', authMiddleware, requireRole('EMPLOYEE'), upload.single('employeeSignature'), (req, res) => {
  const voucherId = req.params.id;

  db.get('SELECT * FROM vouchers WHERE id = ?', [voucherId], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to fetch voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    if (voucher.employee_id !== req.user.id) return res.status(403).json({ message: 'You can only edit your own draft vouchers.' });
    if (voucher.status !== 'DRAFT') return res.status(400).json({ message: 'Only draft vouchers can be edited.' });

    const payload = req.body;
    const employeeSignaturePath = req.file ? `/uploads/${req.file.filename}` : payload.employeeSignature || voucher.employee_signature;

    db.run(
      `UPDATE vouchers SET
        voucher_date = ?,
        expense_date = ?,
        department_name = ?,
        expense_title = ?,
        expense_category = ?,
        expense_description = ?,
        amount = ?,
        employee_signature = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        payload.voucherDate || voucher.voucher_date,
        payload.expenseDate || voucher.expense_date,
        payload.departmentName || voucher.department_name,
        payload.expenseTitle || voucher.expense_title,
        payload.expenseCategory || voucher.expense_category,
        payload.expenseDescription ?? voucher.expense_description,
        Number(payload.amount || voucher.amount),
        employeeSignaturePath,
        new Date().toISOString(),
        voucherId
      ],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ message: 'Unable to update voucher.' });
        db.get('SELECT * FROM vouchers WHERE id = ?', [voucherId], (_queryErr, updated) => {
          if (_queryErr) return res.status(500).json({ message: 'Voucher updated, but could not be reloaded.' });
          res.json({ voucher: normalizeVoucher(updated), message: 'Draft voucher updated successfully.' });
        });
      }
    );
  });
});

app.patch('/api/vouchers/:id/submit', authMiddleware, requireRole('EMPLOYEE'), (req, res) => {
  db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to submit voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    if (voucher.employee_id !== req.user.id) return res.status(403).json({ message: 'You can only submit your own vouchers.' });
    if (voucher.status !== 'DRAFT') return res.status(400).json({ message: 'Only draft vouchers can be submitted.' });
    if (!voucher.employee_signature) return res.status(400).json({ message: 'Employee signature is required before submission.' });

    db.run(
      'UPDATE vouchers SET status = ?, updated_at = ? WHERE id = ?',
      ['PENDING_APPROVAL', new Date().toISOString(), req.params.id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ message: 'Unable to submit voucher.' });
        db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (queryErr, updatedVoucher) => {
          if (queryErr) return res.status(500).json({ message: 'Voucher submitted, but could not be loaded.' });
          res.json({ voucher: normalizeVoucher(updatedVoucher), message: 'Voucher submitted for approval.' });
        });
      }
    );
  });
});

app.patch('/api/vouchers/:id/approve', authMiddleware, requireRole('DIRECTOR'), upload.single('directorSignature'), (req, res) => {
  db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to approve voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    if (voucher.status !== 'PENDING_APPROVAL' && voucher.status !== 'SUBMITTED') {
      return res.status(400).json({ message: 'This voucher is not pending approval.' });
    }

    const directorSignaturePath = req.file ? `/uploads/${req.file.filename}` : req.body.directorSignature || voucher.director_signature;
    if (!directorSignaturePath) {
      return res.status(400).json({ message: 'Director signature is required before approval.' });
    }

    db.run(
      'UPDATE vouchers SET status = ?, director_signature = ?, approval_date = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?',
      ['APPROVED', directorSignaturePath, new Date().toISOString(), new Date().toISOString(), req.params.id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ message: 'Unable to approve voucher.' });
        db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (queryErr, updatedVoucher) => {
          if (queryErr) return res.status(500).json({ message: 'Voucher approved, but could not be loaded.' });
          res.json({ voucher: normalizeVoucher(updatedVoucher), message: 'Voucher approved successfully.' });
        });
      }
    );
  });
});

app.patch('/api/vouchers/:id/reject', authMiddleware, requireRole('DIRECTOR'), (req, res) => {
  const { rejectionReason } = req.body;
  if (!rejectionReason || !String(rejectionReason).trim()) {
    return res.status(400).json({ message: 'Rejection reason is mandatory.' });
  }

  db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to reject voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    if (voucher.status !== 'PENDING_APPROVAL' && voucher.status !== 'SUBMITTED') {
      return res.status(400).json({ message: 'This voucher cannot be rejected.' });
    }

    db.run(
      'UPDATE vouchers SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?',
      ['REJECTED', String(rejectionReason).trim(), new Date().toISOString(), req.params.id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ message: 'Unable to reject voucher.' });
        db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (queryErr, updatedVoucher) => {
          if (queryErr) return res.status(500).json({ message: 'Voucher rejected, but could not be loaded.' });
          res.json({ voucher: normalizeVoucher(updatedVoucher), message: 'Voucher rejected successfully.' });
        });
      }
    );
  });
});

app.delete('/api/vouchers/:id', authMiddleware, requireRole('EMPLOYEE'), (req, res) => {
  db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id], (err, voucher) => {
    if (err) return res.status(500).json({ message: 'Unable to delete voucher.' });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    if (voucher.employee_id !== req.user.id) return res.status(403).json({ message: 'You can only delete your own vouchers.' });
    if (voucher.status !== 'DRAFT') return res.status(400).json({ message: 'Only draft vouchers can be deleted.' });

    db.run('DELETE FROM vouchers WHERE id = ?', [req.params.id], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ message: 'Unable to delete voucher.' });
      res.json({ message: 'Draft voucher deleted.' });
    });
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Voucher Management System API is running.' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Voucher Management System API running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

module.exports = app;
