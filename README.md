# TaskReward Workforce Operations Suite

A comprehensive workforce operations platform for SMEs that connects tasks, attendance, leave, payroll, rewards, and analytics into one trustworthy operational system.

## 🚀 Tech Stack

### Backend
- **FastAPI** — High-performance Python API framework
- **Beanie ODM** — Async MongoDB ODM built on Motor + Pydantic
- **JWT Authentication** — Secure token-based auth
- **Pandas + OpenPyXL** — Report generation (CSV/Excel)

### Frontend
- **Next.js 16** — React framework with App Router
- **Tailwind CSS v4** — Utility-first CSS
- **Recharts** — Charting library for dashboards
- **Lucide React** — Icon library

### Database
- **MongoDB** — Document database (local or Atlas)

## 📋 Features

- ✅ Role-based access (Admin/Employee)
- ✅ Employee management (CRUD)
- ✅ Task assignment and tracking
- ✅ Reward system (+1 point for early completion)
- ✅ Admin dashboard with analytics
- ✅ Employee personal dashboard
- ✅ CSV/Excel report export
- ✅ Leaderboard

## 🏁 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB (local or Atlas)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Seed admin user
python seed.py

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Default Login
- **Admin:** admin@company.com / Admin@123

## 📁 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── auth/          # JWT, password hashing, dependencies
│   │   ├── database/      # MongoDB connection
│   │   ├── models/        # Beanie Document models
│   │   ├── routes/        # API endpoints
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic
│   │   └── main.py        # FastAPI app entry point
│   ├── requirements.txt
│   └── seed.py            # Seed admin user
│
├── frontend/
│   ├── src/
│   │   ├── app/           # Next.js pages (admin + employee)
│   │   ├── contexts/      # Auth context provider
│   │   ├── lib/           # API client, utilities
│   │   └── types/         # TypeScript types
│   └── package.json
│
└── README.md
```

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | User login |
| POST | /auth/register | User registration |
| GET | /auth/me | Current user info |
| GET | /admin/employees | List employees |
| POST | /admin/employees | Create employee |
| PUT | /admin/employees/{id} | Update employee |
| DELETE | /admin/employees/{id} | Deactivate employee |
| POST | /tasks | Create task |
| GET | /tasks | List tasks |
| PUT | /tasks/{id} | Update task |
| DELETE | /tasks/{id} | Delete task |
| GET | /dashboard/admin | Admin dashboard data |
| GET | /dashboard/employee | Employee dashboard data |
| GET | /reports/tasks/csv | Export tasks CSV |
| GET | /reports/tasks/excel | Export tasks Excel |
| GET | /reports/employees/excel | Export employees Excel |
