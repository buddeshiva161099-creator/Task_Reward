# Vision SaaS: Recurrent Task Scheduling Guide

Vision features a robust background engine that automates routine task creation, ensuring that repetitive operational work is assigned consistently without manual intervention.

## 1. ⚙️ How the Recurrence Engine Works
The system uses a **Decoupled Blueprint Architecture**:
1.  **Creation**: When you create a task and enable "Is Recurrent", the system saves a `RecurrenceRule` (Blueprint).
2.  **Initial Spawning**: The first instance of the task is created immediately.
3.  **Background Processing**: Every **60 minutes**, the system runs a background loop (`process_recurrence`) that scans for rules whose `next_run` time has passed.
4.  **Automatic Spawning**: For every active rule that is "due", the engine clones the blueprint into fresh task instances for all target assignees and companies.

---

## 2. 📅 Recurrence Types & Logic
You can configure schedules with the following frequencies:

### **Daily**
*   **Logic**: Tasks are generated every *N* days.
*   **Example**: Set interval to `1` for every day, or `2` for every other day.

### **Weekly**
*   **Logic**: Tasks are generated on specific days of the week.
*   **Parameters**: Select one or more days (e.g., Monday, Wednesday, Friday).
*   **Interval**: Set to `1` for every week, or `2` for bi-weekly on the selected days.

### **Monthly**
*   **Logic**: Tasks are generated on a specific day of the month.
*   **Resilience**: The system handles month-end transitions (e.g., Jan 31st) by automatically adjusting to the last day of shorter months (Feb 28th) and recovering the original date (Mar 31st) in subsequent cycles.

### **Yearly**
*   **Logic**: Tasks are generated once per year on the same date.

---

## 3. 🛑 Termination Rules (When to Stop)
A recurrent schedule can be configured to end in three ways:

1.  **Never**: The schedule remains active indefinitely until manually disabled.
2.  **On Date**: The engine will stop generating tasks after a specific calendar date.
3.  **After Occurrences**: The schedule will automatically deactivate after a set number of tasks have been spawned (e.g., "Run this project meeting task for exactly 10 weeks").

---

## 4. 📝 How to Use (Step-by-Step)

### Step 1: Create the Base Task
*   Navigate to **Tasks > Create Task**.
*   Enter the work description, priority, and categories.
*   Select your **Assignees** and **Companies**. Note: The recurrence will apply to *all* selected combinations.

### Step 2: Enable Recurrence
*   Toggle the **"Is Recurrent"** switch.
*   Select the **Frequency** (Daily, Weekly, Monthly).
*   Configure the **Interval** and specific days (for weekly).

### Step 3: Set the End Condition
*   Choose between **Never**, **Date**, or **Occurrence Count**.
*   Enter the required value (e.g., `2026-12-31` or `12` occurrences).

### Step 4: Save
*   Click **Create Task**. The first set of tasks will appear in the dashboard immediately.
*   The system will automatically schedule the next occurrence based on the deadline of the first task.

---

## 🛠️ Management & Monitoring
*   **Editing**: Managers can update the `RecurrenceRule` to change the description, priority, or assignees. All future tasks spawned from this rule will inherit the new values.
*   **Deactivation**: If a project ends early, simply find the Recurring Rule in the settings and toggle **Is Active** to **Off**.
*   **Template Dependency**: If the original "Blueprint" task is permanently deleted, the recurrence rule will automatically deactivate to prevent errors.

## 💡 Pro Tip
Recurrence is most powerful when combined with **Categories**. Assign a "Routine" or "Maintenance" category to recurrent tasks to easily filter them out from one-time project tasks in your analytics reports.
