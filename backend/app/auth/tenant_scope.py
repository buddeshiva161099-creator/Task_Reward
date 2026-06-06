"""
Tenant scope helper.

Every query in tenant-facing routes (everything outside /platform/*) must
filter by the caller's `tenant_id` to prevent data leakage across tenants.
Use these helpers as a guard.

Platform owners (`role == PLATFORM_OWNER`) are not bound to a tenant and must
use the platform-owner endpoints under `/platform/*` instead.

Active scope headers (both optional, both honored):

  * `X-Active-Company-Id`   -> the admin's sub-org (Company) within the tenant
  * `X-Active-Business-Unit-Id` -> the BU within the active Company

Behaviour:

  * Header missing or value `"all"` -> no filter, aggregated tenant view
    (admin-only; non-admin users MUST send a valid `X-Active-Company-Id`).
  * Header value is a valid id within the caller's tenant -> apply the
    corresponding filter.
  * Header value is invalid or belongs to a different tenant/company -> 400.
  * Manager (`role == MANAGER`) with `scope_company_ids` set -> the request is
    limited to employees/business units inside those companies; the active
    company must be in `scope_company_ids` or 403.
"""
from typing import Optional, Type, TypeVar
from beanie import Document, PydanticObjectId
from fastapi import Depends, HTTPException, Header, status

from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.business_unit import BusinessUnit
from app.models.company import Company

T = TypeVar("T", bound=Document)

ALL_UNITS_SENTINEL = "all"
ALL_COMPANIES_SENTINEL = "all"


def require_tenant_id(current_user: User = Depends(get_current_user)) -> PydanticObjectId:
    """Returns the caller's tenant_id, raising 403 if the user is not a tenant user."""
    if current_user.role == UserRole.PLATFORM_OWNER or current_user.is_platform_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform owners must use the /platform/* endpoints, not tenant routes.",
        )
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with a tenant.",
        )
    return current_user.tenant_id


def _is_admin_or_above(user: User) -> bool:
    return user.role in (
        UserRole.ADMIN,
        UserRole.HR_MANAGER,
        UserRole.ASSISTANT_HR_MANAGER,
    )


async def get_active_company_id(
    current_user: User = Depends(get_current_user),
    x_active_company_id: Optional[str] = Header(default=None, alias="X-Active-Company-Id"),
) -> Optional[PydanticObjectId]:
    """Resolve the active Company from the request header.

    Returns:
        None   -> caller opted into the "All Companies" aggregated view.
        PydanticObjectId -> caller is scoped to a specific company.

    Raises:
        400 if the header value is a non-empty string that isn't "all" or
        a valid ObjectId, or if the ObjectId doesn't belong to the caller's
        tenant, or if a manager's `scope_company_ids` doesn't include it.
    """
    tid = require_tenant_id(current_user)

    if x_active_company_id is None:
        if not _is_admin_or_above(current_user) and not current_user.primary_company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Active-Company-Id header is required for non-admin users.",
            )
        return current_user.primary_company_id

    if x_active_company_id == "" or x_active_company_id == ALL_COMPANIES_SENTINEL:
        if not _is_admin_or_above(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only tenant admins may switch to All Companies.",
            )
        return None

    try:
        cid = PydanticObjectId(x_active_company_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Active-Company-Id is not a valid id.",
        )

    company = await Company.find_one(Company.id == cid, Company.tenant_id == tid)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active company does not belong to your tenant.",
        )

    if current_user.role == UserRole.MANAGER and current_user.scope_company_ids:
        if cid not in current_user.scope_company_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active company is not in your scope_company_ids.",
            )

    return cid


async def get_active_business_unit_id(
    current_user: User = Depends(get_current_user),
    x_active_business_unit_id: Optional[str] = Header(default=None, alias="X-Active-Business-Unit-Id"),
) -> Optional[PydanticObjectId]:
    """Resolve the active BU from the request header.

    Returns:
        None   -> caller opted into the "All Units" aggregated view.
        PydanticObjectId -> caller is scoped to a specific business unit.

    Raises 400 if the header value is a non-empty string that isn't "all" or
    a valid ObjectId, or if the ObjectId doesn't belong to the caller's
    tenant/company. Caller without a tenant (platform owner) -> 403.
    """
    tid = require_tenant_id(current_user)

    if x_active_business_unit_id is None:
        return None
    if x_active_business_unit_id == "" or x_active_business_unit_id == ALL_UNITS_SENTINEL:
        return None
    try:
        buid = PydanticObjectId(x_active_business_unit_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Active-Business-Unit-Id is not a valid id.",
        )
    unit = await BusinessUnit.find_one(
        BusinessUnit.id == buid,
        BusinessUnit.tenant_id == tid,
    )
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active business unit does not belong to your tenant.",
        )
    return buid


def apply_bu_scope(query: dict, business_unit_id: Optional[PydanticObjectId]) -> dict:
    """Augment a Mongo-style query dict with a business_unit_id filter if set."""
    if business_unit_id is not None:
        query["business_unit_id"] = business_unit_id
    return query


def apply_company_scope(query: dict, company_id: Optional[PydanticObjectId]) -> dict:
    """Augment a Mongo-style query dict with a company_id filter if set."""
    if company_id is not None:
        query["company_id"] = company_id
    return query


def tenant_query(model: Type[T], current_user: User, business_unit_id: Optional[PydanticObjectId] = None, **kwargs):
    """Return a Beanie `find()` query filtered by `tenant_id` and (optionally) `business_unit_id`."""
    tid = require_tenant_id(current_user)
    if business_unit_id is not None and hasattr(model, "business_unit_id"):
        return model.find(
            model.tenant_id == tid,
            model.business_unit_id == business_unit_id,
            **kwargs,
        )
    return model.find(model.tenant_id == tid, **kwargs)


async def tenant_count(
    model: Type[T],
    current_user: User,
    business_unit_id: Optional[PydanticObjectId] = None,
    **kwargs,
) -> int:
    """Return count of documents in the caller's tenant matching the given filters."""
    tid = require_tenant_id(current_user)
    if business_unit_id is not None and hasattr(model, "business_unit_id"):
        return await model.find(
            model.tenant_id == tid,
            model.business_unit_id == business_unit_id,
            **kwargs,
        ).count()
    return await model.find(model.tenant_id == tid, **kwargs).count()


async def tenant_get(
    model: Type[T],
    doc_id,
    current_user: User,
    business_unit_id: Optional[PydanticObjectId] = None,
) -> T:
    """Fetch a document by id, scoped to the caller's tenant (and optionally BU)."""
    tid = require_tenant_id(current_user)
    try:
        oid = PydanticObjectId(doc_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    doc = await model.get(oid)
    if not doc or getattr(doc, "tenant_id", None) != tid:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    if business_unit_id is not None and getattr(doc, "business_unit_id", None) != business_unit_id:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found in this business unit")
    return doc


def tenant_filter_expression(model: Type[T], current_user: User, business_unit_id: Optional[PydanticObjectId] = None):
    """Return a Beanie `FindMany` filter expression that can be combined with `&` / `|` operators."""
    tid = require_tenant_id(current_user)
    base = model.tenant_id == tid
    if business_unit_id is not None and hasattr(model, "business_unit_id"):
        return base & (model.business_unit_id == business_unit_id)
    return base
