# List of Errors found in Codebase\n
## 1. Backend Build and Compile-Time Errors

*   **Pydantic Configuration Issues:**
    *   Many Pydantic configuration errors and warnings regarding deprecated settings.
    *   `PydanticDeprecatedSince20: Support for class-based config is deprecated, use ConfigDict instead.` (in multiple Pydantic model configurations).
    *   `PydanticDeprecatedSince20: Using extra keyword arguments on Field is deprecated and will be removed. Use json_schema_extra instead. (Extra keys: 'unique', 'index')`.
*   **Deprecations:**
    *   `DeprecationWarning: 'crypt' is deprecated and slated for removal in Python 3.13`.
*   **Type Hinting & Mypy Issues:**
    *   The `mypy` scan reported **315 errors** across 80 files.
    *   Major missing imports or stubs (`fastapi`, `beanie`, `pydantic`, `httpx`, `pandas`, `openpyxl`). These require `fastapi`, `beanie` to be properly annotated or typing packages like `pandas-stubs`, `types-openpyxl` to be installed.
    *   Type mismatches for `create_employee` fields (e.g., `identity_card_url`, `emergency_contact`, `job_title`, etc. expecting `str` but receiving `str | None`).
    *   `validate_hierarchy_rules` expects `str` but gets `str | None`.
    *   Unsupported operand types for unary `-` with `datetime` objects in `attendance.py`, `ai_service.py` (Likely attempting to perform subtraction or negative operations on datetimes incorrectly).
    *   `Simulation.py` has unsupported operand types for `*` (`object` and `float`) and `<=` (`int` and `object`), implying raw dictionary values are being processed instead of validated floats/ints.
    *   Undefined names `datetime` and `timezone` in `app/routes/ai.py`.
    *   `user_payroll_history` and `user_task_counts` in `ai_service.py` lack proper type annotations.
    *   `Item "None" of "User | None" has no attribute ...` in `app/routes/employees.py` indicating missing null checks.
    *   `TaskResponse` expects `str` but gets `Any | None` for names.
    *   `create_task` expects `datetime` for deadline but gets `datetime | None`.

## 2. Frontend Compile-Time and Linting Errors

*   **Next.js Build Warnings:**
    *   No hard Next.js build errors (the build succeeded), but numerous linting problems.
*   **React Hooks Misuse (Cascading Renders):**
    *   ESLint reports multiple `react-hooks/set-state-in-effect` errors.
    *   `Calling setState synchronously within an effect can trigger cascading renders` in:
        *   `src/contexts/AuthContext.tsx` (Lines: 116, 121, 132, 141)
        *   `src/contexts/OwnerAuthContext.tsx` (Line 37)
        *   `src/components/TaskAttachmentManager.tsx` (Line 64)
*   **TypeScript "Any" Types & Forbidden Requires:**
    *   Unexpected `any` types throughout `src/types/index.ts` and E2E test files (`screenshot-dialogs.spec.ts`).
    *   Forbidden `require()` style imports in `setup-company-employees-live.spec.ts` and `tenant-lifecycle-live.spec.ts`.
*   **Unused Variables:**
    *   Many instances of unused variables (e.g., `useEffect`, `Mail`, `Loader2` in `UserLink.tsx`).

## 3. Logical Errors (Backend & Frontend Connections)

*   **MongoDB Connection/Initialization Error (Test Suite):**
    *   The `pytest` test suite completely fails (`ServerSelectionTimeoutError: [Errno 111] Connect call failed ('127.0.0.1', 27017)`) due to the inability to connect to a local MongoDB instance, halting all 29 test executions. Tests need to either mock DB connections properly or be run in an environment with MongoDB.
*   **Architectural/Logical Flaws from Assessment Report:**
    *   **BUG-001:** Auto-checkout crash due to unhandled exceptions when processing individual records. Needs a `try/except` block and `tenant_id` backfill.
    *   **BUG-002, BUG-003:** The `seed.py` script is broken due to incorrect imports and field names.
    *   **BUG-005:** Tenant ID fallback in check-in improperly falls back to `user.id` instead of raising a 400 error.
    *   **BUG-004:** Hardcoded "Shiva" payroll logic needs to be dynamic.
    *   **BUG-016:** `update_employee` lacks tenant scoping.
    *   **PERF-003:** N+1 query issue in payroll loops.
    *   **TD-011:** Total lack of database migration tooling.
    *   **TD-003, TD-004:** Circular imports and business logic heavily coupled with route definitions.
*   **Frontend-Backend Connection Flaws:**
    *   Playwright E2E tests are failing on timeouts attempting to hit a production URL (`https://hrm.bstk.in/owner/login`) instead of properly running against a local or mock instance.
    *   No backend CI pipeline exists, meaning backend regressions cannot be automatically caught.

## 4. Fallback and UI Errors

*   **Missing Error Boundaries / UI Fallbacks:**
    *   The frontend relies heavily on API calls. If the backend is down (as experienced in the timeout), the UI fails to gracefully fallback or handle the error (Playwright timeout indicates it waited indefinitely without a proper error state UI).
*   **Security Configuration Issues (Failing Safe):**
    *   **SEC-001:** The backend starts with an insecure `JWT_SECRET` in development but does not enforce a strong secret in production, risking token forgery.
    *   **SEC-002:** CORS origins are set to `*` by default, which is highly insecure for authenticated APIs.
    *   **SEC-004:** Lack of rate limiting on auth endpoints (brute force vulnerability).
    *   **SEC-009:** `raw_password` might be exposed in User model serialization; needs `model_config` exclusion.
