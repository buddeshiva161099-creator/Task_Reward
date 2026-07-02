# Suggested Fixes for Codebase Errors

This document outlines the proposed solutions for the issues identified in `errors.md`.

## 1. Backend Build and Compile-Time Errors

*   **Pydantic Configuration Issues:**
    *   **Fix:** Migrate all Pydantic V1 `class Config:` declarations to Pydantic V2 `model_config = ConfigDict(...)` across all model files in `backend/app/models/` and `backend/app/schemas/`.
    *   **Fix:** Replace `Field(..., unique=True)` and `Field(..., index=True)` with `json_schema_extra={"unique": True}` or handle indexes directly through Beanie's `Settings.indexes` configuration.
*   **Deprecations (`crypt` module):**
    *   **Fix:** Update `passlib` or migrate to standard `bcrypt` for password hashing to avoid relying on the deprecated `crypt` module for Python 3.13 compatibility.
*   **Type Hinting & Mypy Issues:**
    *   **Fix:** Install necessary type stubs in `backend/requirements.txt`: `pandas-stubs`, `types-openpyxl`.
    *   **Fix:** In `app/routes/employees.py`, update the `create_employee` endpoint and `validate_hierarchy_rules` to properly handle `None` values (e.g., provide defaults or strictly require strings). Add explicit `if user is None: raise HTTPException(...)` checks before accessing attributes.
    *   **Fix:** In `app/routes/attendance.py` and `app/services/ai_service.py`, fix the unary `-` operations on datetimes by using `timedelta` (e.g., `datetime.now() - timedelta(days=X)` instead of `-datetime`).
    *   **Fix:** In `app/routes/simulation.py`, explicitly cast dictionary or object values to `float` or `int` before performing mathematical operations.
    *   **Fix:** In `app/routes/ai.py`, add `from datetime import datetime, timezone`.
    *   **Fix:** In `app/services/ai_service.py`, add explicit type annotations: `user_payroll_history: dict[str, Any] = {}` and `user_task_counts: dict[str, int] = {}`.
    *   **Fix:** In `app/routes/tasks.py`, update `TaskResponse` schema to explicitly allow `str | None` or ensure strings are always passed, and fix `deadline` typing.

## 2. Frontend Compile-Time and Linting Errors

*   **React Hooks Misuse (Cascading Renders):**
    *   **Fix:** In `src/contexts/AuthContext.tsx`, `src/contexts/OwnerAuthContext.tsx`, and `src/components/TaskAttachmentManager.tsx`, refactor `useEffect` blocks. Instead of calling `setState` inside a `useEffect` that triggers on mount, fetch the data and set the state concurrently, or move the logic to an initialization function outside the component render cycle if possible. For standard fetches, this warning can sometimes be resolved by ensuring dependency arrays are correct or using a data-fetching library (like SWR or React Query), but minimally, we can suppress or refactor the direct sync `setState` calls.
*   **TypeScript "Any" Types & Forbidden Requires:**
    *   **Fix:** Replace `any` in `src/types/index.ts` and `screenshot-dialogs.spec.ts` with explicit interfaces (e.g., `Employee`, `Task`, `User`).
    *   **Fix:** In E2E tests, replace `require()` imports with standard ES6 `import` syntax.
*   **Unused Variables:**
    *   **Fix:** Remove all unused imports (e.g., `useEffect`, `Mail`, `Loader2` in `UserLink.tsx`) to clean up the code and resolve ESLint warnings.

## 3. Logical Errors (Backend & Frontend Connections)

*   **MongoDB Connection (Test Suite):**
    *   **Fix:** Update `backend/tests/conftest.py` to use a mock MongoDB database (`mongomock_motor`) properly for unit tests, or configure a dynamic fallback so `pytest` doesn't hang if a local MongoDB isn't running.
*   **Architectural/Logical Flaws:**
    *   **BUG-001 (Auto-checkout crash):** Wrap the record processing loop in `app/routes/attendance.py` with `try/except` and add a `tenant_id` field fallback to prevent the entire job from crashing on a single malformed record.
    *   **BUG-002, BUG-003 (seed.py):** Update imports and field names in `backend/seed.py` to match the current Pydantic/Beanie models.
    *   **BUG-005 (Tenant ID fallback):** In check-in logic, remove the fallback to `user.id` and instead `raise HTTPException(status_code=400, detail="Tenant ID required")`.
    *   **BUG-004 (Hardcoded Payroll):** Remove hardcoded "Shiva" checks in `app/routes/payroll.py` and rely strictly on role/tenant-based logic.
    *   **BUG-016 (Tenant Scoping):** Ensure `update_employee` filters by the active user's `tenant_id`.
    *   **PERF-003 (N+1 query):** Refactor payroll loop to pre-fetch tenants/holidays globally before looping through employees.
*   **Frontend-Backend Connection Flaws:**
    *   **Fix:** Update Playwright config (`playwright.config.ts`) to target a local server (e.g., `http://localhost:3000`) instead of the production `https://hrm.bstk.in` URL, and ensure tests mock API responses if the backend is unavailable.

## 4. Fallback and UI Errors

*   **Missing Error Boundaries / UI Fallbacks:**
    *   **Fix:** Implement a global React `<ErrorBoundary>` wrapper in `src/app/layout.tsx` to catch render errors gracefully.
    *   **Fix:** Add standard `try/catch` and UI error state rendering (e.g., toast notifications or error banners) for failed API calls in major dashboard components.
*   **Security Configuration Issues:**
    *   **SEC-001:** Enforce a check in `backend/app/main.py` on startup: `if ENVIRONMENT == "production" and JWT_SECRET == "insecure_default": raise RuntimeError(...)`.
    *   **SEC-002:** In `backend/app/main.py`, remove `allow_origins=["*"]` from CORS middleware and require explicit configuration via environment variables.
    *   **SEC-004:** Implement `slowapi` for rate limiting on `/auth/login` endpoints.
    *   **SEC-009:** Ensure the `User` Pydantic model uses `exclude=True` or `Field(exclude=True)` for the `raw_password` or `hashed_password` fields so they are never returned in JSON responses.
