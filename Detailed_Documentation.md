# Employee Task & Reward Management System - Detailed Documentation

## 1. Project Overview
The **Employee Task & Reward Management System (TaskReward)** is a full-stack SaaS application designed to seamlessly integrate workforce management, productivity tracking, geographic attendance monitoring, leave/payroll management, and an AI-driven insights platform. It heavily features a gamified **Reward Points System**, incentivizing employees to complete tasks accurately and on time while adhering to company policies.

The system is built on a 5-tier Role-Based Access Control (RBAC) structure:
1. **Super Admin**
2. **HR Manager**
3. **Assistant HR Manager**
4. **Manager**
5. **Assistant Manager**
6. **Employee**

## 2. Current Implementation (Tech Stack & Architecture)

### Frontend
- **Framework:** Next.js 16 (App Router, Turbo)
- **UI Library:** React 19
- **Styling:** Tailwind CSS 4
- **State/Data Fetching:** Axios for HTTP requests, native React Context (`AuthContext`) for global state management.
- **Components:** Functional components heavily relying on `lucide-react` for iconography and `recharts` for dashboard analytics.
- **Routing Structure:** Split into `/admin/*` for management roles and `/employee/*` for regular staff workflows, ensuring clear separation of concerns.

### Backend
- **Framework:** FastAPI (Python 3.12.9)
- **Database:** MongoDB
- **ODM (Object Document Mapper):** Beanie ODM over Motor (Asynchronous driver).
- **Authentication:** JWT (JSON Web Tokens) with Bcrypt password hashing.
- **Reporting/Data Processing:** Pandas and OpenPyXL for generating CSV/Excel reports dynamically.
- **Architecture Pattern:** Router-Service-Model architecture. Business logic is encapsulated in the `services` layer, isolating it from the API `routes`.

### Key System Entities (Database Models)
- **Users:** Represents employees across all roles, storing authentication, RBAC, and accumulated reward points.
- **Tasks:** Core entity tracking assignments, deadlines, priorities, multi-layered status transitions, and point rewards based on timeliness and quality.
- **Attendance:** Geographic tracking entity storing check-ins/outs, lat/lng coordinates, distance from office, and auto-flagging anomalies.
- **Companies:** Stores tenant-like rules including work hours, geofence radius, and customizable reward algorithms.
- **Leaves & Leave Balances:** Tracks paid time off requests and allocations.
- **Payroll & Salary Structures:** Automated calculations processing base salaries against absences, late arrivals, incentives, and penalties.
- **Chat Groups & Messages:** Real-time collaboration contexts linking discussions to specific tasks.

---

## 3. Dedicated Section for All Features

### Authentication & Access Control
- JWT-based login with role extraction.
- Automatic routing based on user tier (`/admin` vs `/employee`).
- Password change and emergency session termination capabilities.

### Task Management & Gamification (Reward System)
- **CRUD Operations:** Create, Read, Update, and Delete tasks.
- **Gamification Algorithm:** Employees earn reward points based on task priority (Critical = 10, High = 5, Medium = 3, Regular = 1).
- **Delay Penalties:** Points are dynamically multiplied by a penalty factor if overdue (e.g., On Time = 100%, 1 day late = 75%, 2 days = 50%, 4+ days = 0%).
- **Early Completion Multiplier:** Bonus points (e.g., 1.1x) awarded for completing tasks >24 hours early.
- **Quality Multipliers:** Managers can adjust points post-completion based on work quality (0.8x for rework, 1.2x for exemplary).
- **Task Recurrence:** Support for daily, weekly, or monthly recurring tasks via a background cron service.
- **Categories:** Tasks can be tagged using customizable, color-coded categories.

### Geofence-Enabled Smart Attendance
- **Check-In/Out:** Web-based check-in capturing browser-level GPS coordinates.
- **Geofence Validation:** Calculates the Haversine distance between the employee's location and the configured company office coordinates. Flags or blocks check-ins outside the permitted radius.
- **Auto-Checkout:** A background service automatically closes stale attendance sessions left open past working hours (14+ hours or past designated end time).
- **Drift Detection:** Flags anomalies if check-in and check-out locations drastically differ.

### Leave & Regularization Management
- **PTO Rules:** Enforces customizable limits on Casual, Sick, and Earned leaves based on the Company profile.
- **Multi-Level Approval:** Leaves sit in a `Pending` state, requiring HR or Manager verification and approval.
- **Attendance Regularization:** Allows employees to retroactively request corrections for missed punches or system errors, appending evidence/comments.

### Automated Payroll Engine
- **Salary Configuration:** Configurable structures (Basic, HRA, Special Allowances, PF, ESI, Taxes).
- **Dynamic Calculation:** Automatically ingests attendance data (Present vs. LOP days), applying delay penalties, early bonuses, and earned task reward points directly into the monthly financial net pay.
- **Status Lifecycle:** Draft -> Under Review -> Approved -> Locked -> Paid.

### Collaboration (Chat System)
- Dedicated chat groups that can be linked to specific Tasks.
- Support for text messages and file uploads.
- Real-time notification integration.

### AI Workforce Intelligence
- **OpenAI Integration:** Zero-dependency wrapper querying LLM APIs (GPT-4o-mini).
- **Dashboard Summaries:** Generates natural language insights on employee performance, pending bottlenecks, and managerial recommendations based on live DB data.
- **AI Task Assistant:** A floating chat widget available on all screens allowing users to ask natural language questions about their workloads or system procedures.

### Global Search & Notifications
- **Global Search:** Cross-entity search indexing Users, Tasks, Companies, and Chats.
- **Notification Center:** In-app bell alerts for task assignments, leave approvals, and system broadcasts.

### Reporting & Analytics
- **Data Export:** Admins can export Task and Attendance data natively to `.csv` or `.xlsx` (Excel) files utilizing Pandas.
- **Leaderboards:** Real-time ranking of employees based on their gamified Reward Points.
- **Dashboard Charts:** Visual distribution of task statuses, priority levels, and workforce demographics.

---

## 4. Important Detailed Workflows

### Workflow 1: Employee Check-In and Geofence Verification
**Frontend Action:**
1. The Employee logs in and sees the `AttendanceToggle` component in the header.
2. Clicking "Check In" triggers the browser's Geolocation API to fetch current latitude and longitude.
3. The coordinates are sent to the backend.

**Backend Explanation:**
1. The `/attendance` route receives the request and fetches the user's `Company` settings.
2. The `geofence_utils.py` service calculates the Haversine distance between the user's coordinates and the `office_lat`/`office_lng`.
3. If the distance exceeds `geofence_radius_meters`, the check-in is either rejected (strict policy) or flagged as anomalous (flexible policy).
4. If valid, an `Attendance` document is created with a timestamp and `"status": "present"`.

### Workflow 2: Task Creation, Completion, and Reward Point Assignment
**Frontend Action:**
1. A Manager navigates to `/admin/tasks` and creates a "High Priority" task assigned to an Employee, setting a strict deadline.
2. The Employee views this in `/employee/tasks`, changes status to "In Progress", and eventually "Completed" via the task detail modal.

**Backend Explanation:**
1. Creation (`POST /tasks`): Creates a `Task` document.
2. Update (`PUT /tasks/{id}`): When status transitions to "Completed", the system triggers the `apply_performance_score` function in `reward_service.py`.
3. The service fetches the Company's configuration. A "High" task has a base of 5.0 points.
4. The system checks the current `datetime` against the task's `deadline`.
    - If submitted exactly on time: 5.0 * 1.0 (Timeliness) * 1.0 (Quality) = 5.0 points.
    - If submitted 1 day late: 5.0 * 0.75 = 3.75 points.
5. The points are added to the user's global `reward_points` total, and an `ActivityLog` is generated detailing the math. The employee instantly climbs the Leaderboard.

### Workflow 3: End of Month Automated Payroll Drafting
**Frontend Action:**
1. The HR Manager navigates to `/admin/payroll`, selects an Employee, and clicks "Draft Payroll" for the current month.

**Backend Explanation:**
1. The backend API (`POST /payroll/draft`) receives the request.
2. The system queries the `Attendance` collection for the specified month to aggregate total working days, present days, and absent/LOP days.
3. It fetches the user's `SalaryStructure` (Base, HRA, etc.).
4. It calculates prorated pay: `(Base Salary / Total Working Days) * Present Days`.
5. It queries `Leave` collections for approved paid time off and adds it back to the present count.
6. A `Payroll` document is saved in `DRAFT` status for human review before final approval.

### Workflow 4: Requesting Leave (PTO)
**Frontend Action:**
1. The Employee goes to `/employee/leaves` and submits a request for 2 days of "Casual Leave".

**Backend Explanation:**
1. API receives the request and checks the `LeaveBalance` collection.
2. If the employee has enough balance, a `Leave` document is created with status `PENDING`.
3. A `Notification` document is generated for the employee's reporting manager.
4. The Manager later hits `PUT /leaves/{id}/action` to "Approve" it, which subsequently deducts the amount from the employee's `LeaveBalance` document.
