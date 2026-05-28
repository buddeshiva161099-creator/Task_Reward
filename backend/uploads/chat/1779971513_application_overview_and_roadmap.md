# Application Features Overview & Usage Roadmap

## 📚 Table of Contents
1. [Introduction](#introduction)
2. [Core Features](#core-features)
   - [Attendance Management](#attendance-management)
   - [Regularization (Attendance Corrections)](#regularization-attendance-corrections)
   - [Employee & Hierarchy Management](#employee--hierarchy-management)
   - [Dashboard & Reporting](#dashboard--reporting)
   - [Notification System](#notification-system)
   - [Audit Logging & Activity Trail](#audit-logging--activity-trail)
   - [Role‑Based Access Control (RBAC)](#role‑based-access-control-rbac)
   - [Time‑Zone Handling & Localization](#time‑zone-handling--localization)
3. [Roadmap to Efficient Use](#roadmap-to-efficient-use)
   - [Step 1: Initial Setup & Configuration](#step1-initial-setup--configuration)
   - [Step 2: Employee On‑boarding](#step2-employee-on‑boarding)
   - [Step 3: Daily Attendance Workflow](#step3-daily-attendance-workflow)
   - [Step 4: Manager / HR Review Cycle](#step4-manager--hr-review-cycle)
   - [Step 5: Admin Oversight & Reporting](#step5-admin-oversight--reporting)
   - [Step 6: Automation & Integration](#step6-automation--integration)
4. [Automation Opportunities for Organizations](#automation-opportunities-for-organizations)
5. [Business Value & Why Choose This Application](#business-value--why-choose-this-application)
6. [Future Enhancements (Suggested Roadmap)](#future-enhancements‑suggested-roadmap)
7. [Getting Help & Contributing](#getting-help--contributing)

---

## Introduction
The **Vision Employee Work Scheduler with Privacy** is a modern, privacy‑first employee attendance and regularization platform. It combines a responsive web UI with a robust backend powered by **FastAPI**, **Beanie (MongoDB ODM)**, and **pydantic** models. The system is built for **SMEs to large enterprises** that need transparent, auditable, and automated attendance workflows while respecting employee privacy.

---

## Core Features

### Attendance Management
- **Punch‑In / Punch‑Out** tracking for each employee.
- Automatic **time‑zone conversion** to Indian Standard Time (IST) for consistency across regions.
- Real‑time **presence status** (`present`, `absent`, `late`, etc.) stored in the `Attendance` collection.
- Self‑service **attendance history** view for employees.

### Regularization (Attendance Corrections)
- Employees can **apply for a regularization** (correction) with an optional attachment (e.g., medical certificate).
- System validates that a request is **pending** and prevents duplicate requests per attendance record.
- **Multi‑stage workflow**:
  1. **Verification** – any manager/HR can verify the request.
  2. **Review** – HR‑manager or senior manager adds final comments.
  3. **Approval** – Admin (or designated approver) updates the original attendance log.
  4. **Rejection** – Manager/HR can reject with comments.
- Each stage **creates an `ActivityLog`** entry for auditability and returns the acting role (`performed_by`).

### Employee & Hierarchy Management
- CRUD endpoints for **employees**, including fields for `reporting_manager_id` and `hr_reporting_manager_id` to build an organisational hierarchy.
- **Role enums** (`ADMIN`, `HR_MANAGER`, `ASSISTANT_HR_MANAGER`, `MANAGER`, `EMPLOYEE`) drive permission checks.
- Helper endpoint to **fetch visible employee IDs** for a given manager, ensuring hierarchy‑based data isolation.

### Dashboard & Reporting
- Aggregated views for **attendance statistics** (present/absent counts, late arrivals, etc.).
- **Pending regularization** list filtered by hierarchy, enabling managers to focus on their team.
- **Historical dashboards** for admins to track trends over weeks/months.

### Notification System
- Automatic **system notifications** (stored in `Notification` collection) for:
  - New regularization requests.
  - Verification, review, approval, and rejection events.
  - Attendance anomalies.
- Notifications are **push‑ready** for front‑end consumption (e.g., badge count, email integration).

### Audit Logging & Activity Trail
- Every critical action (verify, review, approve, reject) creates an entry in `ActivityLog` with:
  - `user_id`, `user_name`, `action`, `details`, and timestamp.
- Enables **compliance audits** and **traceability** for HR/legal teams.

### Role‑Based Access Control (RBAC)
- Dependency‑injected FastAPI **security dependencies** (`require_management_team`, `require_admin`, etc.) restrict endpoints.
- Managers/HR can only act on employees **within their visibility hierarchy**.
- Admins have **global** access.

### Time‑Zone Handling & Localization
- All timestamps are normalized to **IST** via `ist_time` utility, preventing confusion in distributed teams.
- Front‑end components display dates using the user’s locale while the backend stores a single canonical zone.

---

## Roadmap to Efficient Use

### Step 1: Initial Setup & Configuration
1. **Deploy the backend** (Docker/virtualenv) and run `npm run dev` for the front‑end.
2. **Create initial admin user** via the `/auth/register` endpoint (or directly in DB).
3. Configure **SMTP/email** (optional) for external notifications.
4. Set **organization hierarchy** – assign `reporting_manager_id` and `hr_reporting_manager_id` for each employee.

### Step 2: Employee On‑boarding
- Bulk‑import employees via CSV or API.
- Employees set their **profile details** and can immediately view their attendance dashboard.

### Step 3: Daily Attendance Workflow
1. **Punch‑in** at start of shift → system records `check_in`.
2. **Punch‑out** at end of shift → system records `check_out`.
3. Employees can view their **daily log** and request regularization if needed.

### Step 4: Manager / HR Review Cycle
| Stage | Who Acts | What Happens |
|-------|----------|--------------|
| **Verify** | Manager / HR Manager | Checks request validity, adds comments, logs action, notifies HR & Admin. |
| **Review** | HR Manager (or senior manager) | Marks as reviewed, logs, notifies admin. |
| **Approve** | Admin | Updates Attendance record, logs, sends final acceptance notification. |
| **Reject** | Manager / HR Manager | Marks request rejected, logs, notifies employee and their managers. |

All stages are **automated** with notifications, ensuring no manual email chase.

### Step 5: Admin Oversight & Reporting
- Use the **Dashboard** to monitor attendance health, pending regularizations, and audit logs.
- Export reports (CSV/Excel) for payroll or compliance purposes.

### Step 6: Automation & Integration
- **Cron jobs** (via FastAPI background tasks) can:
  - Auto‑close stale pending requests after X days.
  - Send daily attendance summary emails to managers.
- **Webhooks** can push notifications to Slack, Teams, or HRIS systems.
- **APIs** expose data for BI tools (PowerBI, Tableau) for deeper analytics.

---

## Automation Opportunities for Organizations
- **Zero‑touch regularization**: Employees upload a justification; the system routes it automatically based on hierarchy.
- **Scheduled compliance checks**: Detect missing punches or abnormal patterns and auto‑escalate.
- **Payroll integration**: Pull verified attendance data nightly into payroll engines.
- **Leave balance syncing**: Combine with a leave‑management module (future extension) to auto‑deduct approved leaves.
- **Policy enforcement**: Auto‑reject requests that fall outside allowed windows (e.g., > 2 days late).
- **Audit readiness**: Generate audit‑ready logs with a single click for regulators.

---

## Business Value & Why Choose This Application
1. **Transparency** – Every action is logged and visible to the relevant stakeholders, reducing disputes.
2. **Time‑Saving** – Automated notifications and role‑based routing eliminate back‑and‑forth emails.
3. **Scalable RBAC** – Works for small teams and large hierarchies without code changes.
4. **Privacy‑First** – Only authorized roles see employee‑specific data; audit logs are immutable.
5. **Modern UI/UX** – Clean, responsive front‑end built with TypeScript and React, offering a premium experience.
6. **Extensible Architecture** – Clean separation of concerns (routes, models, utils) allows easy addition of new modules (e.g., shift scheduling, overtime). 

---

## Future Enhancements (Suggested Roadmap)
- **Shift & Roster Management** – Define multiple shifts per day and auto‑assign employees.
- **Geolocation Punch‑In** – Capture GPS for remote workers.
- **Machine Learning Alerts** – Predict attendance anomalies.
- **Self‑service Portal** – Employees can view and export their own logs.
- **Multi‑language support** – Internationalization for global deployments.
- **Mobile App** – Native iOS/Android companion for offline punch‑in.

---

## Getting Help & Contributing
- **Documentation**: `README.md` in the repo explains local dev setup.
- **Issue Tracker**: Open bugs/features on the GitHub project.
- **Contribution Guide**: Follow the `CONTRIBUTING.md` for pull‑request standards.
- **Support**: Reach out to the admin via the built‑in **Contact** page (future feature).

---

*Prepared on 2026‑05‑23. Use this guide to onboard teams, automate attendance workflows, and maintain a clean audit trail across the organization.*

---
