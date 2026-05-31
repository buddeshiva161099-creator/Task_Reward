# Vision SaaS: 6-Tier Hierarchy & RBAC Guide

Vision uses a sophisticated Role-Based Access Control (RBAC) system with a rigid 6-tier hierarchy to ensure organizational discipline and data security.

## 1. 🛡️ The 6 Tiers of Access
Every user is assigned exactly one role, which defines their scope of action and data visibility.

1.  **Admin**: The system owner. Unrestricted access to all data, settings, and billing across all companies.
2.  **HR Manager**: Top-level HR authority. Manages global company rules, payroll cycles, and top-tier employee records.
3.  **Assistant HR Manager**: Operational HR support. Handles leave verifications and employee onboarding under an HR Manager.
4.  **Manager**: Operational leadership. Responsible for project-level task assignments and performance auditing for their team.
5.  **Assistant Manager**: Front-line supervisors. Directly manages employees, provides real-time task support, and monitors attendance.
6.  **Employee**: The operational workforce. Focuses on task execution, attendance logs, and personal reward points.

---

## 2. 🌳 Strict Reporting Hierarchy
To maintain integrity in approvals and visibility, Vision enforces a **Double-Reporting Path**:

### **Operational Reporting (Tasks & Workflow)**
*   **Employees** must report to an **Assistant Manager**.
*   **Assistant Managers** must report to a **Manager**.
*   **Managers**, **HR Managers**, and **Admins** do not require a superior in the system.

### **HR Reporting (Leaves & Payroll)**
*   **Employees** must report to an **Assistant HR Manager**.
*   **Assistant HR Managers** must report to an **HR Manager**.

---

## 3. 👁️ Data Visibility Rules
Visibility is "Bottom-Up" based on the reporting chain:

*   **Managers** see data for: Themselves + Assistant Managers reporting to them + Employees reporting to those Assistant Managers.
*   **HR Managers** see data for: Themselves + Assistant HR Managers reporting to them + Employees reporting to those Assistant HR Managers.
*   **Assistant Managers** see data for: Themselves + Employees reporting directly to them.
*   **Employees** see data for: Only themselves.

---

## 4. ✅ Validation Logic
When creating or updating an employee, the system prevents logical errors:
1.  **Circular Dependency Check**: You cannot assign an employee to report to someone who eventually reports back to them.
2.  **Role Mismatch Protection**: You cannot assign an Employee to report to an Admin; they *must* report to an Assistant Manager (Operational) and Assistant HR Manager (HR) to follow the organizational chain of command.
3.  **Cross-Hierarchy Protection**: Management users cannot see or edit employees who are not in their direct reporting line, preventing data leaks between different departments or branches.
