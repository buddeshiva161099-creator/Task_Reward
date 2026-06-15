"""
FastAPI application entry point. Updated with Global Search.
Employee Task & Reward Management System
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import init_db




from app.routes import auth, employees, tasks, dashboard, reports, attendance, search, holidays, notifications, categories, leaves, regularization, payroll, chat, ai, simulation, platform, business_units, companies, tenants


import asyncio
from app.services import recurrence_service
from app.middleware import exception_handler_middleware, tenant_status_middleware


def validate_runtime_security_settings():
    """Fail fast on deployment settings that would weaken production security."""
    import logging
    _logger = logging.getLogger(__name__)
    if not settings.is_production:
        if settings.uses_insecure_jwt_secret:
            _logger.warning("DEVELOPMENT WARNING: Running with an insecure JWT_SECRET. Do NOT use this secret in production.")
        if "*" in settings.cors_origins_list:
            _logger.warning("DEVELOPMENT WARNING: CORS allows all origins (*). Restrict this in production.")
        return
    if settings.uses_insecure_jwt_secret:
        raise RuntimeError("JWT_SECRET must be changed before running in production.")
    if "*" in settings.cors_origins_list:
        raise RuntimeError("CORS_ORIGINS cannot include '*' when ENVIRONMENT=production.")
    if settings.ALLOW_PUBLIC_REGISTRATION:
        raise RuntimeError("ALLOW_PUBLIC_REGISTRATION must be disabled in production.")


async def ensure_platform_owner_exists():
    """Warn loudly if the platform has no owner account configured."""
    from app.models.user import User, UserRole
    count = await User.find(User.role == UserRole.PLATFORM_OWNER).count()
    if count == 0:
        print(
            "[WARNING] No platform owner account found. "
            "Run: python seed_platform_owner.py --email owner@vision.app --password '<strong>' --name 'Owner'"
        )


async def auto_checkout_stale_sessions():
    """Auto-close attendance sessions that are still open past work hours."""
    from app.models.attendance import Attendance, ist_now
    from app.models.tenant import Tenant
    from datetime import datetime, timezone
    import logging
    _logger = logging.getLogger(__name__)
    
    try:
        # Find all open sessions
        open_sessions = await Attendance.find(Attendance.check_out == None).to_list()
        
        for session in open_sessions:
            try:
                if not session.tenant_id:
                    _logger.warning(f"Session {session.id} lacks tenant_id. Skipping auto-checkout processing.")
                    continue
                
                tenant = await Tenant.get(session.tenant_id)
                if not tenant or not tenant.auto_checkout_enabled:
                    continue
                
                # Parse work_end_time robustly
                try:
                    wt = tenant.work_end_time.strip().upper()
                    is_pm = "PM" in wt
                    wt_clean = wt.replace("AM", "").replace("PM", "").strip()
                    end_parts = wt_clean.split(":")
                    end_hour = int(end_parts[0])
                    end_min = int(end_parts[1]) if len(end_parts) > 1 else 0
                    if is_pm and end_hour < 12:
                        end_hour += 12
                except Exception:
                    end_hour, end_min = 18, 0  # Default 6 PM IST
                
                # Use timezone-aware calculations
                from app.models.attendance import IST
                now_utc = datetime.now(timezone.utc)
                local_now = now_utc.astimezone(IST)
                session_age_hours = (now_utc - session.check_in).total_seconds() / 3600
                
                # Auto-close if: current IST hour is past (end + 1h) OR session > 14h
                if local_now.hour > end_hour + 1 or session_age_hours > 14:
                    session.check_out = now_utc
                    session.is_auto_closed = True
                    session.remarks = (session.remarks or "") + " [Auto-closed by system]"
                    if "auto_closed" not in session.flags:
                        session.flags.append("auto_closed")
                    await session.save()

                    # Send missed checkout alert
                    try:
                        from app.services.notification_service import NotificationService
                        await NotificationService.notify_user(
                            user_id=session.user_id,
                            title="Missed Checkout Alert",
                            message="You missed to check out yesterday. Your session was automatically closed by the system.",
                            type="system"
                        )
                    except Exception as ne:
                        _logger.warning(f"Could not send auto-checkout notification for user {session.user_id}: {ne}")

                    # Write an audit log entry for the auto-close action
                    try:
                        from app.services.audit_service import AuditService
                        await AuditService.log_event(
                            actor=None,
                            entity_type="attendance",
                            entity_id=session.id,
                            action="auto_checkout",
                            before_state={"check_out": None, "is_auto_closed": False},
                            after_state={
                                "check_out": session.check_out.isoformat() if session.check_out else None,
                                "is_auto_closed": True,
                                "flags": list(session.flags or []),
                            },
                            ip_address=None,
                            user_agent="system:auto_checkout",
                        )
                    except Exception as ae:
                        _logger.warning(f"Could not write audit log for auto-checkout of session {getattr(session, 'id', 'unknown')}: {ae}")

                    _logger.info(f"[AUTO-CHECKOUT] Closed stale session for user {session.user_id}")
            except Exception as se:
                _logger.error(f"Error processing auto-checkout for session {getattr(session, 'id', 'unknown')}: {se}")
    except Exception as e:
        _logger.error(f"Error in auto-checkout: {e}")


async def backfill_attendance_tenant_ids():
    """Backfill missing tenant_id in Attendance documents using corresponding User's tenant_id."""
    from app.models.attendance import Attendance
    from app.models.user import User
    import logging
    _logger = logging.getLogger(__name__)
    
    try:
        orphaned = await Attendance.find(Attendance.tenant_id == None).to_list()
        if not orphaned:
            return
        
        _logger.info(f"[MIGRATION] Found {len(orphaned)} Attendance documents without tenant_id. Starting backfill...")
        count = 0
        for att in orphaned:
            user = await User.get(att.user_id)
            if user and user.tenant_id:
                att.tenant_id = user.tenant_id
                await att.save()
                count += 1
            else:
                _logger.warning(f"[MIGRATION] Attendance {att.id} user {att.user_id} has no tenant_id or doesn't exist.")
        _logger.info(f"[MIGRATION] Successfully backfilled tenant_id for {count} Attendance documents.")
    except Exception as e:
        _logger.error(f"[MIGRATION] Error in backfill_attendance_tenant_ids: {e}")


async def run_periodic_tasks():
    """Background loop for recurring tasks with adaptive sleep."""
    import logging
    _logger = logging.getLogger(__name__)
    base_sleep = 60  # Check every minute if active/busy
    max_sleep = 900  # Max sleep 15 minutes
    current_sleep = base_sleep

    while True:
        try:
            # Run tasks
            await recurrence_service.process_recurrence()
            await auto_checkout_stale_sessions()

            # Adaptive sleep calculation based on active data
            from app.models.attendance import Attendance
            from app.models.recurring_task import RecurrenceRule
            
            open_count = await Attendance.find(Attendance.check_out == None).count()
            active_rules = await RecurrenceRule.find(RecurrenceRule.is_active == True).count()
            
            if open_count > 0 or active_rules > 0:
                current_sleep = 300  # 5 minutes
            else:
                current_sleep = max_sleep  # 15 minutes
        except Exception as e:
            _logger.error(f"Error in background task loop: {e}")
            current_sleep = base_sleep

        await asyncio.sleep(current_sleep)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize DB and background tasks."""
    validate_runtime_security_settings()
    await init_db()

    # Seed default templates
    from app.services.notification_engine_service import NotificationEngineService
    await NotificationEngineService.seed_templates()

    await ensure_platform_owner_exists()

    # Run the backfill migration for legacy attendance documents
    await backfill_attendance_tenant_ids()

    bg_task = asyncio.create_task(run_periodic_tasks())
    yield
    bg_task.cancel()


app = FastAPI(
    title="Employee Task & Reward Management System",
    description="API for managing employees, tasks, productivity tracking, and rewards",
    version="1.0.0",
    lifespan=lifespan,
)

from app.middleware import exception_handler_middleware, tenant_status_middleware, security_headers_middleware
from fastapi.responses import FileResponse
from fastapi import Depends, HTTPException, status
from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
import os

# Create uploads directory if not exists
os.makedirs("uploads/chat", exist_ok=True)
os.makedirs("uploads/identity_docs", exist_ok=True)


@app.get("/uploads/{file_type}/{tenant_sub}/{filename}", tags=["Uploads"])
async def get_uploaded_file(
    file_type: str,
    tenant_sub: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Securely serve uploaded identity documents and chat files, enforcing tenant isolation."""
    # 1. Validate file type
    if file_type not in {"identity_docs", "chat"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File type not found")

    # 2. Check tenant scoping / isolation
    if current_user.role != UserRole.PLATFORM_OWNER:
        expected_tenant_sub = f"tenant_{current_user.tenant_id}" if current_user.tenant_id else "global"
        if tenant_sub != expected_tenant_sub:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Tenant isolation check failed."
            )

    # 3. Path traversal prevention
    file_path = os.path.normpath(os.path.join("uploads", file_type, tenant_sub, filename))
    base_dir = os.path.abspath("uploads")
    safe_path = os.path.abspath(file_path)

    if not safe_path.startswith(base_dir):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")

    if not os.path.exists(safe_path) or not os.path.isfile(safe_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(safe_path)


# Register custom exception handler and middlewares
app.middleware("http")(exception_handler_middleware)
app.middleware("http")(tenant_status_middleware)
app.middleware("http")(security_headers_middleware)

@app.middleware("http")
async def jwt_expiry_warning_middleware(request, call_next):
    from app.auth.jwt_handler import check_token_near_expiry, decode_access_token, create_access_token
    from app.config import settings

    token = None
    cookie_key = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
    else:
        token = request.cookies.get("access_token")
        if token:
            cookie_key = "access_token"
        else:
            token = request.cookies.get("owner_access_token")
            if token:
                cookie_key = "owner_access_token"

    response = await call_next(request)

    if token:
        try:
            payload = decode_access_token(token)
            if payload and check_token_near_expiry(token, threshold_minutes=15):
                new_data = {k: v for k, v in payload.items() if k not in ("exp", "aud")}
                new_token = create_access_token(new_data)
                
                if not cookie_key:
                    role = payload.get("role")
                    if role == "platform_owner":
                        cookie_key = "owner_access_token"
                    else:
                        cookie_key = "access_token"
                
                response.set_cookie(
                    key=cookie_key,
                    value=new_token,
                    httponly=True,
                    secure=settings.ENVIRONMENT == "production",
                    samesite="lax",
                    max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                )
                
                response.headers["X-Token-Expiry-Warning"] = "true"
                response.headers["X-Refreshed-Token"] = new_token
                
                expose = response.headers.get("Access-Control-Expose-Headers", "")
                new_exposes = ["X-Token-Expiry-Warning", "X-Refreshed-Token"]
                if expose:
                    existing = [e.strip() for e in expose.split(",")]
                    for ne in new_exposes:
                        if ne not in existing:
                            existing.append(ne)
                    response.headers["Access-Control-Expose-Headers"] = ", ".join(existing)
                else:
                    response.headers["Access-Control-Expose-Headers"] = ", ".join(new_exposes)
        except Exception:
            pass
    return response


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
app.include_router(holidays.router, prefix="/holidays", tags=["Holiday Management"])
app.include_router(search.router)
app.include_router(notifications.router)
app.include_router(categories.router)
app.include_router(leaves.router)
app.include_router(regularization.router)
app.include_router(payroll.router)
app.include_router(chat.router)
app.include_router(ai.router)
app.include_router(simulation.router)
app.include_router(platform.router)
app.include_router(tenants.router)
app.include_router(companies.router)
app.include_router(business_units.router)



@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": "Employee Task & Reward Management System",
        "version": "1.0.0",
    }