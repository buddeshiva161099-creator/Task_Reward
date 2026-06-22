# TaskReward Workforce Operations Suite

A comprehensive workforce operations platform for SMEs that connects tasks, attendance, leave, payroll, rewards, and analytics into one trustworthy operational system.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide React |
| **Backend** | FastAPI (Python 3.12), Beanie ODM (async MongoDB), Pandas + OpenPyXL |
| **Database** | MongoDB (local or Atlas) |
| **Auth** | JWT (JSON Web Tokens) with Bcrypt password hashing |

## 6-Tier Role-Based Access Control

| Tier | Role | Access |
|------|------|--------|
| 1 | **Admin (Super Admin)** | Global oversight, full access to all companies, employees, and system-wide configurations |
| 2 | **HR Manager** | Recruitment, leave policies, payroll drafting, and organizational rules |
| 3 | **Assistant HR Manager** | Operational HR support, managing employee files and leave approvals under HR Manager |
| 4 | **Manager** | Team lead — work allocation, task approvals, and performance auditing |
| 5 | **Assistant Manager** | Directly monitors employee workflows, provides real-time task support, manages reportees |
| 6 | **Employee** | Task execution, attendance tracking, and earning reward points |

## Features

### Task Management & Gamification
- **Dynamic Priority System** — Critical, High, Medium, Regular, Low
- **Reward Points Algorithm** — Base points by priority, early completion bonus (1.1x), delay penalties (75%/50%/0%), quality multipliers (exemplary 1.2x, rework 0.8x)
- **Recurrence Engine** — Automated daily, weekly, or monthly task generation
- **Categories** — Customizable, color-coded task tags

### Geofence-Enabled Smart Attendance
- **GPS Verification** — Captures lat/lng during check-in/out
- **Geofence Policy** — Strict (rejects outside radius) or Flexible (flags anomalies)
- **Location Drift Detection** — Flags sessions with check-in/check-out location mismatch
- **Auto-Checkout** — Background service closes stale sessions past working hours

### AI Workforce Intelligence
- **Executive Dashboard Summaries** — Role-specific natural language insights
- **Task Intelligence** — Predicts completion risks, flags overloaded assignees
- **Performance Analytics** — Burnout detection, productivity trends, work consistency
- **AI Copilot** — In-app chat widget for natural language operational queries

### Automated Payroll Engine
- **Salary Structures** — Configurable: Basic, HRA, Special Allowances, PF, ESI, Taxes
- **Dynamic Drafting** — Auto-pulls attendance, leaves, and reward points data
- **Status Lifecycle** — Draft → Under Review → Approved → Locked → Paid

### Leave & Regularization
- **Multi-Category PTO** — Casual, Sick, Earned with balance enforcement
- **Multi-Level Approvals** — HR and Manager verification workflows
- **Attendance Regularization** — Retroactive correction requests for missed punches

### Reporting & Collaboration
- **Rich Analytics** — Interactive charts for task status, priority, productivity
- **Leaderboards** — Real-time ranking by reward points
- **Multi-Format Export** — CSV, Excel, print-ready reports
- **Task-Linked Chat** — Group discussions with file sharing

### Global Search & Notifications
- **Cross-Entity Search** — Users, Tasks, Companies, Chats
- **Notification Center** — In-app bell alerts for assignments, approvals, broadcasts

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB (local or Atlas)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python seed.py          # Seed admin user
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

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── auth/          # JWT, password hashing, dependencies
│   │   ├── database/      # MongoDB connection
│   │   ├── models/        # Beanie Document models (28 collections)
│   │   ├── routes/        # API endpoints
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic
│   │   └── main.py        # FastAPI app entry point
│   ├── requirements.txt
│   └── seed.py
│
├── frontend/
│   ├── src/
│   │   ├── app/           # Next.js pages (admin + employee)
│   │   ├── components/    # Reusable UI components
│   │   ├── contexts/      # Auth context provider
│   │   ├── lib/           # API client, utilities
│   │   └── types/         # TypeScript types
│   └── package.json
```

## API Endpoints

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

## Documentation

| Document | Description |
|----------|-------------|
| `ATTENDANCE_GUIDE.md` | Geofence technology, strict/flexible policies, anomaly detection |
| `HIERARCHY_RBAC.md` | 6-tier hierarchy, double-reporting paths, RBAC data visibility |
| `PAYROLL_ENGINE.md` | Salary components, calculation logic, automated drafting |
| `RECURRENCE_GUIDE.md` | Recurring task blueprint architecture, scheduling, assignment |
| `AI_INTELLIGENCE_GUIDE.md` | GPT integration, heuristic analysis, AI copilot |
| `USER_GUIDE.md` | End-user guide for Admin/HR/Manager/Employee roles |
| `DEPENDENCY_MATRIX.md` | Cross-module event-to-impact mapping |
| `PRODUCT_EVOLUTION_ROADMAP.md` | Strategic product modernization roadmap |
| `architect_assessment_report.md` | Codebase health assessment (62/100), bug inventory, security audit |
