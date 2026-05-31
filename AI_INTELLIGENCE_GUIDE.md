# Vision SaaS: AI Workforce Intelligence Guide

Vision integrates an advanced AI Engine (GPT-powered) to transform raw organizational data into actionable executive insights and natural language assistance.

## 1. 🧠 Heuristic Heuristics & Analysis
The AI engine runs complex algorithms across the database to generate risk and performance scores.

### **Task Intelligence (Risk Prediction)**
*   **Algorithm**: Evaluates `TaskPriority` vs. `Time Left` before deadline.
*   **Risk Tiers**:
    *   **High Risk (>70%)**: Critical tasks with <24 hours remaining.
    *   **Medium Risk (35-70%)**: High/Medium priority tasks with <72 hours remaining.
*   **Overload Detection**: Flags any employee with **4 or more active tasks** and provides "Allocation Suggestions" to move work to underutilized team members.

### **Performance Intelligence**
*   **Productivity Score**: Calculated as `(Tasks Completed / Total Tasks Assigned) * 100`.
*   **Consistency Score**: Derived from attendance logs (deducting late check-ins).
*   **Burnout Risk**: A proprietary flag triggered when an employee has **average shifts > 9.5 hours** AND an **active task backlog >= 3**.

---

## 2. 🤖 AI Dashboard Summary
Every time a user logs in, the system generates a role-appropriate executive summary using LLM synthesis:
*   **Admins**: High-level view of company-wide productivity, payroll variance anomalies, and critical late trends.
*   **Managers**: Team health check, focusing on "At Risk" tasks and overloaded members.
*   **Employees**: Personal scorecard, efficiency ratings, and specific recommendations (e.g., "Complete pending regularizations to avoid salary deductions").

---

## 3. 💬 AI Copilot Assistant
The floating chat widget allows users to query their operational context using natural language.

### **How it Works (Fact-Retrieval Flow)**:
1.  **Intent Recognition**: The engine parses your query (e.g., "Who is overloaded?").
2.  **Database Scoping**: The system retrieves relevant "Facts" from the database based on your role's visibility permissions (RBAC).
3.  **LLM Synthesis**: Facts are sent to the OpenAI-compatible API to generate a friendly, conversational response.

### **Example Queries**:
*   *"Show me all overdue tasks in my team."*
*   *"Who are the top 3 performers by productivity score?"*
*   *"Identify any unusual payroll spikes for this month."* (Admins/HR only)
*   *"Why is my productivity score low?"* (Analyzes task completion ratios)

---

## 🛡️ Privacy & Security
The AI engine is **RBAC-Aware**. It will never disclose payroll information to a regular employee or allow a manager to see data for teams outside their hierarchy. All AI insights are cached for 1 hour to ensure peak system performance.
