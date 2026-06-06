## 2025-05-24 - Beanie Query Serialization in Aggregations
**Learning:** Python comparison expressions (e.g., `Model.field >= value`) in Beanie return internal `Comparison` objects. These are not directly serializable for MongoDB's native driver (Motor/PyMongo) when nested in dictionaries, which often happens in `aggregate` or `distinct` calls. This leads to runtime `bson.errors.InvalidDocument` or `TypeError`.
**Action:** Always use Beanie operators from `beanie.operators` (e.g., `GTE`, `NE`, `In`) when building manual query dictionaries for `aggregate` or `distinct`. These operators return plain dictionaries that are safe for the driver.

## 2025-05-24 - Database-Level Hierarchy Filtering
**Learning:** The application's RBAC system often uses hierarchy discovery (`get_visible_employee_ids`). Fetching all users or tasks into memory to filter by hierarchy (`[t for t in all_tasks if t.assigned_to in visible_ids]`) is a major O(N) bottleneck that scales poorly.
**Action:** Always push hierarchy and ownership filters to the database level using `In` and `Or` operators (e.g., `User.find(In(User.id, list(visible_ids)))`). For task visibility, combine with creator checks: `Task.find(Or(In(Task.assigned_to, list(visible_ids)), Task.created_by == current_user.id))`.
## 2026-06-01 - In-memory RBAC Filtering Anti-pattern
**Learning:** Several core visibility functions (like `get_visible_employee_ids`) were fetching the entire User collection into memory and filtering in Python. This causes severe performance degradation as the user base grows.
**Action:** Replace in-memory filtering with database-level operations. Use `Model.distinct("_id", query)` to efficiently retrieve just the necessary IDs for visibility sets.

## 2026-06-01 - Aggregation-based Task Statistics
**Learning:** Calculating task completion rates and durations in memory by fetching all tasks is extremely slow and memory-intensive for even moderate datasets (~1.3s for 1000 tasks).
**Action:** Use MongoDB aggregation pipelines with $group and $cond to compute statistics like 'assigned', 'completed', and 'total_hours' at the database level. This reduced execution time by ~27% in my benchmark and will scale much better.

## 2026-06-01 - Collection Direct Access for Projections
**Learning:** Beanie 2.1.0 sometimes struggles with dictionary-based projections when using .project() on its find() queries, leading to Pydantic configuration errors.
**Action:** Use `Model.get_pymongo_collection().find(query, projection)` to bypass Beanie's projection model layer when only a few fields are needed as dictionaries. This is faster and more reliable for internal analytical logic.

## 2026-06-05 - Batch Overdue Task Updates
**Learning:** The previous implementation of `get_tasks` performed an O(N) loop to check and update each task's overdue status individually using `await task.set()`. This caused severe performance degradation (up to 12s for just 50 tasks) as each update triggered a separate database round-trip.
**Action:** Replace sequential updates in loops with a single `update_many` operation using `Model.find(query).update({"$set": {...}})`. This reduced execution time by ~94% in benchmarks.

## 2026-06-05 - Push RBAC and Hierarchy Filtering to Database
**Learning:** Fetching all tasks into memory to filter by hierarchy (e.g., `[t for t in all_tasks if t.assigned_to in visible_ids]`) is a major scalability bottleneck.
**Action:** Extend service signatures to accept collections of IDs (e.g., `user_ids: List[PydanticObjectId]`) and use database-level operators like `In` and `Or` to perform the filtering at the database layer.
