# Expense Voucher Management System

A full-stack expense voucher workflow for employees, directors, and accounts users. Employees create and submit vouchers, directors approve or reject them, and accounts users can review all vouchers.

## Technology

- Frontend: React 18 and Vite
- Backend: Node.js and Express
- Database: SQLite (`server/data/voucher_management.db`)
- Authentication: JWT with bcrypt password hashing
- File uploads: Multer for employee and director signatures

## Project Setup

### Prerequisites

- Node.js 18 or newer
- npm

### Install

From the project root:

```bash
npm install
cd client && npm install
cd ..
```

Create the local environment file:

```bash
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env` instead.

Set a unique `JWT_SECRET` in `.env` before using the application outside local development.

### Run in development

```bash
npm run dev
```

This starts:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`

The Vite development server proxies `/api` and `/uploads` requests to the backend. If port 5173 is busy, Vite chooses the next available port; use the URL printed in the terminal.

The backend root redirects to the frontend. The API health check is available at `GET http://localhost:5000/api/health`.

### Build the frontend

```bash
npm run build
```

### Run the backend only

```bash
npm start
```

The SQLite database and upload directory are created automatically when the server starts. Database initialization also creates the demo users and one sample submitted voucher when the tables are empty.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Employee | `employee@abc.com` | `employee123` |
| Director | `director@abc.com` | `director123` |
| Accounts | `accounts@abc.com` | `accounts123` |

These credentials are for local development only.

## Database Schema

The application uses two tables. The executable schema is also provided in [server/data/schema.sql](server/data/schema.sql). Runtime initialization is handled by `server/src/db.js` using `CREATE TABLE IF NOT EXISTS`.

### `users`

Stores authenticated users and their workflow role.

- `id`: primary key
- `name`, `email`: required user identity fields; email is unique
- `password_hash`: bcrypt password hash, never returned by the API
- `role`: `EMPLOYEE`, `DIRECTOR`, or `ACCOUNTS`
- `department`, `employee_id`: optional organization details
- `created_at`: creation timestamp

### `vouchers`

Stores expense claims and their approval state.

- `id`, `voucher_number`: primary key and unique human-readable number
- `voucher_date`, `expense_date`: voucher and expense dates
- `department_name`, `expense_title`, `expense_category`, `expense_description`: claim details
- `amount`: positive numeric amount
- `employee_id`: required foreign key to `users.id`
- `employee_name`, `employee_code`: employee snapshot fields used on voucher records
- `employee_signature`, `director_signature`: stored upload paths or signature values
- `status`: normally `DRAFT`, `PENDING_APPROVAL`, `SUBMITTED`, `APPROVED`, or `REJECTED`
- `approval_date`, `rejection_reason`: decision details
- `created_at`, `updated_at`: timestamps

The schema includes indexes for employee and status filtering. `schema.sql` describes the database structure; the application currently performs initialization and demo seeding in code rather than running a migration framework.

## API Documentation

Base URL: `http://localhost:5000/api` (or `/api` through the Vite frontend proxy).

Protected endpoints require:

```http
Authorization: Bearer <jwt-token>
```

JSON endpoints use `Content-Type: application/json`. Voucher create, update, and approval requests may use `multipart/form-data` when uploading a signature file.

### System

#### `GET /health`

Returns `{ "status": "ok", "message": "..." }` when the API is running.

### Authentication

#### `POST /auth/register`

Creates a user and returns a JWT.

Request JSON:

```json
{
  "name": "New Employee",
  "email": "new.employee@example.com",
  "password": "password123",
  "role": "EMPLOYEE",
  "department": "Operations",
  "employee_id": "EMP-102"
}
```

`name`, `email`, and `password` are required. Passwords must contain at least six characters. The default role is `EMPLOYEE`.

#### `POST /auth/login`

Authenticates a user and returns `{ token, user }`.

```json
{
  "email": "employee@abc.com",
  "password": "employee123"
}
```

#### `GET /auth/me`

Protected. Returns the current user profile.

### Vouchers

#### `GET /vouchers`

Protected. Employees receive their own vouchers. Directors and accounts users receive all vouchers.

#### `GET /vouchers/:id`

Protected. Returns one voucher. Employees may only view their own vouchers.

#### `POST /vouchers`

Protected; employee role required. Creates a voucher.

Required fields: `voucherDate`, `expenseDate`, `departmentName`, `expenseTitle`, `expenseCategory`, and a positive `amount`. An employee signature is required either as the `employeeSignature` field or as an uploaded file named `employeeSignature`.

Optional fields include `expenseDescription` and `status` (defaults to `DRAFT`).

#### `PUT /vouchers/:id`

Protected; employee role required. Updates one of the employee's own `DRAFT` vouchers. It accepts the same voucher fields and an optional `employeeSignature` upload.

#### `PATCH /vouchers/:id/submit`

Protected; employee role required. Changes an owned draft with a signature to `PENDING_APPROVAL`.

#### `PATCH /vouchers/:id/approve`

Protected; director role required. Approves a pending or submitted voucher. A director signature is required as the `directorSignature` field or as an uploaded file named `directorSignature`.

#### `PATCH /vouchers/:id/reject`

Protected; director role required. Rejects a pending or submitted voucher.

Request JSON:

```json
{
  "rejectionReason": "Please provide the original receipt."
}
```

The rejection reason is mandatory.

#### `DELETE /vouchers/:id`

Protected; employee role required. Deletes the employee's own `DRAFT` voucher.

### Response and error conventions

Successful responses are JSON and commonly include a `user`, `voucher`, or `vouchers` property plus a user-facing `message`. Errors return a JSON `message` with an HTTP status such as `400` for validation, `401` for missing or invalid authentication, `403` for role or ownership restrictions, `404` for missing records, and `500` for server/database failures.

Uploaded files are served from `/uploads/<filename>`.

## Assumptions

- This is a local/internal workflow application; there is no email verification, password reset, or production user administration flow.
- Roles selected during registration are trusted. Production deployments should restrict who can create director or accounts users.
- JWTs are stored by the browser in `localStorage` and expire after eight hours. HTTPS is required in production.
- SQLite is appropriate for the expected local or small-team workload. A server database and migration tool should be introduced for higher concurrency or distributed deployment.
- Signature files are stored on the local server filesystem in `server/uploads`; persistent shared storage is needed for multiple server instances.
- Voucher numbers are generated from the current date and row count. A transaction or sequence would be preferable if many users create vouchers concurrently.
- The seeded sample voucher assumes the first seeded employee has ID `1`; a fresh empty database is expected during initialization.
- Dates are stored as text, and monetary values are stored as SQLite `REAL` values. Production financial workflows should define timezone and currency rules explicitly.
- The frontend uses the Vite proxy in development. A production deployment must configure the frontend API origin or serve the built frontend through a web server that routes API requests correctly.
