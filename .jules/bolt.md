## 2025-05-24 - Beanie Query Serialization in Aggregations
**Learning:** Python comparison expressions (e.g., `Model.field >= value`) in Beanie return internal `Comparison` objects. These are not directly serializable for MongoDB's native driver (Motor/PyMongo) when nested in dictionaries, which often happens in `aggregate` or `distinct` calls. This leads to runtime `bson.errors.InvalidDocument` or `TypeError`.
**Action:** Always use Beanie operators from `beanie.operators` (e.g., `GTE`, `NE`, `In`) when building manual query dictionaries for `aggregate` or `distinct`. These operators return plain dictionaries that are safe for the driver.

## 2025-05-24 - Database-Level Hierarchy Filtering
**Learning:** The application's RBAC system often uses hierarchy discovery (`get_visible_employee_ids`). Fetching all users or tasks into memory to filter by hierarchy (`[t for t in all_tasks if t.assigned_to in visible_ids]`) is a major O(N) bottleneck that scales poorly.
**Action:** Always push hierarchy and ownership filters to the database level using `In` and `Or` operators (e.g., `User.find(In(User.id, list(visible_ids)))`). For task visibility, combine with creator checks: `Task.find(Or(In(Task.assigned_to, list(visible_ids)), Task.created_by == current_user.id))`.
## 2026-06-01 - In-memory RBAC Filtering Anti-pattern
**Learning:** Several core visibility functions (like `get_visible_employee_ids`) were fetching the entire User collection into memory and filtering in Python. This causes severe performance degradation as the user base grows.
**Action:** Replace in-memory filtering with database-level operations. Use `Model.distinct("_id", query)` to efficiently retrieve just the necessary IDs for visibility sets.
