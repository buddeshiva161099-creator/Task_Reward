"""
Company (sub-org) CRUD routes.

These are the routes the tenant admin uses to manage Companies (the
sub-orgs inside their tenant). The 3-level hierarchy is:
  Tenant  ->  Company (this)  ->  BusinessUnit  ->  Users

Authorization:
  * Tenant admin / hr_manager: full CRUD over the tenant's companies.
  * Manager with `scope_company_ids` populated: read-only on the listed
    companies (so the manager dropdown is correctly populated); cannot
    create / update / deactivate.
  * Other roles: 403.

Behavior:
  * POST /companies          - create. On first Company in a tenant, the
    caller's `primary_company_id` is auto-pinned. A default HQ BusinessUnit
    is auto-created inside the Company.
  * GET  /companies          - active companies in the caller's tenant
    (managers see only their scope).
  * GET  /companies/{id}     - one company (tenant-scoped).
  * PATCH /companies/{id}    - update name/description.
  * POST /companies/{id}/deactivate - soft-deactivate (admin only).
  * GET  /companies/{id}/business-units - the BUs inside a Company.
"""
from typing import List, Optional
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.dependencies import (
    get_current_user,
    require_admin,
)
from app.auth.tenant_scope import require_tenant_id, get_active_company_id
from app.models.company import Company
from app.models.business_unit import BusinessUnit, BUSINESS_UNIT_TYPE_HQ
from app.models.user import User, UserRole
from app.services.audit_service import AuditService

router = APIRouter(prefix="/companies", tags=["Companies"])


class CreateCompanyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)


class UpdateCompanyRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)


class CompanyResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    is_default: bool
    tenant_id: str
    created_at: str
    updated_at: Optional[str]


def _serialize(c: Company) -> CompanyResponse:
    return CompanyResponse(
        id=str(c.id),
        name=c.name,
        description=c.description,
        is_active=c.is_active,
        is_default=c.is_default,
        tenant_id=str(c.tenant_id),
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat() if c.updated_at else None,
    )


def _manager_visible_filter(user: User) -> Optional[set[PydanticObjectId]]:
    """Return the set of company ids a manager may see; None = unrestricted."""
    if user.role != UserRole.MANAGER:
        return None
    if not user.scope_company_ids:
        return None
    return set(user.scope_company_ids)


@router.get("", response_model=List[CompanyResponse])
async def list_companies(current_user: User = Depends(get_current_user)):
    """List active companies in the caller's tenant. Managers see their scope only."""
    tid = require_tenant_id(current_user)
    scope = _manager_visible_filter(current_user)
    companies = await Company.find(
        Company.tenant_id == tid,
        Company.is_active == True,
    ).sort("name").to_list()
    if scope is not None:
        companies = [c for c in companies if c.id in scope]
    return [_serialize(c) for c in companies]


@router.get("/all", response_model=List[CompanyResponse])
async def list_all_companies(admin: User = Depends(require_admin)):
    """List every company in the caller's tenant, including inactive (admin only)."""
    tid = require_tenant_id(admin)
    companies = await Company.find(Company.tenant_id == tid).sort("-created_at").to_list()
    return [_serialize(c) for c in companies]


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: str, current_user: User = Depends(get_current_user)):
    tid = require_tenant_id(current_user)
    try:
        cid = PydanticObjectId(company_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid company id")
    company = await Company.find_one(Company.id == cid, Company.tenant_id == tid)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if current_user.role == UserRole.MANAGER and current_user.scope_company_ids:
        if company.id not in current_user.scope_company_ids:
            raise HTTPException(status_code=403, detail="Company is not in your scope.")
    return _serialize(company)


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    request: CreateCompanyRequest,
    http_request: Request,
    admin: User = Depends(require_admin),
):
    """Create a new Company in the caller's tenant.

    On the first Company in the tenant, the caller's `primary_company_id`
    is auto-pinned to the new company. A default HQ BusinessUnit is also
    auto-created inside the new Company.
    """
    tid = require_tenant_id(admin)

    existing = await Company.find_one(
        Company.tenant_id == tid,
        Company.name == request.name,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A company with this name already exists in your tenant.",
        )

    is_first = (await Company.find(Company.tenant_id == tid).count()) == 0

    company = Company(
        name=request.name,
        description=request.description,
        tenant_id=tid,
        is_active=True,
        is_default=is_first,
        created_by=admin.id,
    )
    await company.insert()

    if is_first and (not admin.primary_company_id):
        admin.primary_company_id = company.id
        await admin.save()

    hq = BusinessUnit(
        name="Head Office",
        type=BUSINESS_UNIT_TYPE_HQ,
        code="HQ",
        tenant_id=tid,
        company_id=company.id,
        description="Default business unit created automatically.",
        is_active=True,
        is_default=True,
    )
    await hq.insert()

    await AuditService.log_event(
        actor=admin,
        entity_type="company",
        entity_id=company.id,
        action="created",
        after_state=company.model_dump(),
        ip_address=http_request.client.host if http_request.client else None,
        user_agent=http_request.headers.get("user-agent") if http_request else None,
    )

    return _serialize(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    request: UpdateCompanyRequest,
    http_request: Request,
    admin: User = Depends(require_admin),
):
    tid = require_tenant_id(admin)
    try:
        cid = PydanticObjectId(company_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid company id")
    company = await Company.find_one(Company.id == cid, Company.tenant_id == tid)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    before = company.model_dump()
    update_data = {k: v for k, v in request.model_dump().items() if v is not None}
    if "name" in update_data:
        clash = await Company.find_one(
            Company.tenant_id == tid,
            Company.name == update_data["name"],
            Company.id != company.id,
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this name already exists in your tenant.",
            )
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await company.set(update_data)

    await AuditService.log_event(
        actor=admin,
        entity_type="company",
        entity_id=company.id,
        action="updated",
        before_state=before,
        after_state=company.model_dump(),
        ip_address=http_request.client.host if http_request.client else None,
        user_agent=http_request.headers.get("user-agent") if http_request else None,
    )

    return _serialize(company)


@router.post("/{company_id}/deactivate", response_model=CompanyResponse)
async def deactivate_company(
    company_id: str,
    http_request: Request,
    admin: User = Depends(require_admin),
):
    tid = require_tenant_id(admin)
    try:
        cid = PydanticObjectId(company_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid company id")
    company = await Company.find_one(Company.id == cid, Company.tenant_id == tid)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The default Company cannot be deactivated.",
        )
    if not company.is_active:
        return _serialize(company)

    company.is_active = False
    company.updated_at = datetime.now(timezone.utc)
    await company.save()

    await AuditService.log_event(
        actor=admin,
        entity_type="company",
        entity_id=company.id,
        action="deactivated",
        before_state={"is_active": True},
        after_state={"is_active": False},
        ip_address=http_request.client.host if http_request.client else None,
        user_agent=http_request.headers.get("user-agent") if http_request else None,
    )

    return _serialize(company)


@router.get("/{company_id}/business-units", response_model=List[dict])
async def list_company_business_units(
    company_id: str,
    current_user: User = Depends(get_current_user),
):
    tid = require_tenant_id(current_user)
    try:
        cid = PydanticObjectId(company_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid company id")
    company = await Company.find_one(Company.id == cid, Company.tenant_id == tid)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if current_user.role == UserRole.MANAGER and current_user.scope_company_ids:
        if company.id not in current_user.scope_company_ids:
            raise HTTPException(status_code=403, detail="Company is not in your scope.")

    units = await BusinessUnit.find(
        BusinessUnit.tenant_id == tid,
        BusinessUnit.company_id == cid,
        BusinessUnit.is_active == True,
    ).sort("name").to_list()
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "type": u.type,
            "code": u.code,
            "is_default": u.is_default,
            "is_active": u.is_active,
            "company_id": str(u.company_id),
            "tenant_id": str(u.tenant_id),
        }
        for u in units
    ]
