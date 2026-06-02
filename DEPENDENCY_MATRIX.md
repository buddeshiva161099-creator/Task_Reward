# Workforce Operations Dependency Matrix

| Event | Affected Modules | Notifications Triggered | Audit Events Created | Payroll Impact | Tests Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Employee Created** | Employees, Auth, Leave, Payroll | Welcome, Manager Alert | `EmployeeCreated` | Setup leave/salary defaults | Onboarding → Task Assignment |
| **Task Assigned** | Tasks, Notifications | Task Assigned | `TaskAssigned` | None | Assignment workflow |
| **Task Due Soon/Overdue** | Tasks, Notifications | Task Due Soon / Overdue | `TaskEscalated` (on overdue) | None | Background reminder jobs |
| **Leave Submitted** | Leave, Notifications | Leave Application Submitted | `LeaveSubmitted` | None | Application flow |
| **Leave Approved** | Leave, Attendance, Payroll, Notifications | Leave Approved | `LeaveApproved` | Flag Recalculation (Impacted Period) | Leave Approval → Payroll Impact |
| **Leave Rejected** | Leave, Notifications | Leave Rejected | `LeaveRejected` | None | Rejection flow |
| **Regularization Submitted**| Regularization, Notifications | Regularization Submitted | `RegularizationSubmitted` | None | Submission flow |
| **Regularization Approved** | Regularization, Attendance, Payroll, Notifications | Regularization Approved | `RegularizationApproved` | Flag Recalculation (Impacted Period) | Regularization → Payroll Impact |
| **Regularization Rejected** | Regularization, Notifications | Regularization Rejected | `RegularizationRejected` | None | Rejection flow |
| **Payroll Drafted** | Payroll, Notifications | Payroll Drafted | `PayrollDrafted` | Draft created | Draft creation flow |
| **Payroll Reviewed** | Payroll, Notifications | Payroll Under Review | `PayrollReviewed` | Status change | Review workflow |
| **Payroll Locked** | Payroll, Notifications | Payroll Locked | `PayrollLocked` | Block upstream mutations | Payroll Lock → Blocked Mutation |
| **Payroll Paid** | Payroll, Notifications | Payslip/Payment Alert | `PayrollPaid` | Immutable record | Payment workflow |
| **Auto-Checkout** | Attendance, Notifications | Missed Checkout Alert | `AttendanceAutoClosed` | None | Auto-checkout job |
| **Policy Changed** | Company, All Modules | Policy Change Notification | `PolicyChanged` | Potential re-runs | Policy impact validation |
