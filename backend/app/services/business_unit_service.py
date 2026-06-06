"""
BusinessUnit service - CRUD operations for business units (sub-organizations
within a tenant).
"""
from typing import List, Optional
from beanie import PydanticObjectId
from app.models.business_unit import BusinessUnit, BUSINESS_UNIT_TYPES
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from fastapi import HTTPException, status


async def _ensure_tenant_admin(user: User) -> PydanticObjectId:
    """Validate that the caller is a tenant admin and return their tenant id."""
    if user.is_platform_owner or user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant admins can manage business units.",
        )
    return user.tenant_id


async def list_business_units(tenant_id: PydanticObjectId, include_inactive: bool = False, company_id: Optional[PydanticObjectId] = None) -> List[BusinessUnit]:
    q: dict = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = True
    if company_id is not None:
        q["company_id"] = company_id
    return await BusinessUnit.find(q).sort("+name").to_list()


async def get_business_unit(tenant_id: PydanticObjectId, unit_id: PydanticObjectId, include_inactive: bool = False) -> BusinessUnit:
    unit = await BusinessUnit.find_one(
        BusinessUnit.id == unit_id,
        BusinessUnit.tenant_id == tenant_id,
    )
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business unit not found in this tenant.",
        )
    if not include_inactive and not unit.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business unit is inactive.",
        )
    return unit


async def create_business_unit(
    tenant_id: PydanticObjectId,
    company_id: PydanticObjectId,
    name: str,
    type: str = "department",
    code: Optional[str] = None,
    description: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    timezone: Optional[str] = None,
    currency: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_phone: Optional[str] = None,
    work_days: Optional[list[str]] = None,
    work_start_time: Optional[str] = None,
    work_end_time: Optional[str] = None,
    is_default: bool = False,
) -> BusinessUnit:
    if type not in BUSINESS_UNIT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid type. Must be one of: {', '.join(BUSINESS_UNIT_TYPES)}",
        )

    tenant = await Tenant.get(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found.",
        )

    from app.models.company import Company
    company = await Company.find_one(Company.id == company_id, Company.tenant_id == tenant_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company does not belong to this tenant.",
        )

    existing = await BusinessUnit.find_one(
        BusinessUnit.tenant_id == tenant_id,
        BusinessUnit.company_id == company_id,
        BusinessUnit.name == name,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A business unit named '{name}' already exists in this company.",
        )

    if is_default:
        await BusinessUnit.find(
            BusinessUnit.tenant_id == tenant_id,
            BusinessUnit.company_id == company_id,
            BusinessUnit.is_default == True,
        ).update_many({"$set": {"is_default": False}})

    unit_count = await BusinessUnit.find(
        BusinessUnit.tenant_id == tenant_id,
        BusinessUnit.company_id == company_id,
    ).count()
    will_be_default = is_default or unit_count == 0

    unit = BusinessUnit(
        name=name,
        type=type,
        code=code,
        tenant_id=tenant_id,
        company_id=company_id,
        description=description,
        address=address,
        city=city,
        state=state,
        country=country or tenant.country if hasattr(tenant, "country") else None,
        timezone=timezone,
        currency=currency,
        contact_email=contact_email,
        contact_phone=contact_phone,
        work_days=work_days,
        work_start_time=work_start_time,
        work_end_time=work_end_time,
        is_default=will_be_default,
    )
    await unit.insert()
    return unit


async def update_business_unit(
    tenant_id: PydanticObjectId,
    unit_id: PydanticObjectId,
    patch: dict,
) -> BusinessUnit:
    unit = await get_business_unit(tenant_id, unit_id)

    if "type" in patch and patch["type"] not in BUSINESS_UNIT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid type. Must be one of: {', '.join(BUSINESS_UNIT_TYPES)}",
        )

    if "name" in patch and patch["name"] != unit.name:
        dup = await BusinessUnit.find_one(
            BusinessUnit.tenant_id == tenant_id,
            BusinessUnit.name == patch["name"],
            BusinessUnit.id != unit_id,
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A business unit named '{patch['name']}' already exists in this tenant.",
            )

    if patch.get("is_default") and not unit.is_default:
        await BusinessUnit.find(
            BusinessUnit.tenant_id == tenant_id,
            BusinessUnit.is_default == True,
            BusinessUnit.id != unit_id,
        ).update_many({"$set": {"is_default": False}})

    from datetime import datetime, timezone
    patch["updated_at"] = datetime.now(timezone.utc)
    await unit.update({"$set": patch})
    return await get_business_unit(tenant_id, unit_id)


async def deactivate_business_unit(tenant_id: PydanticObjectId, unit_id: PydanticObjectId) -> BusinessUnit:
    unit = await get_business_unit(tenant_id, unit_id)
    if unit.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate the default business unit.",
        )
    from datetime import datetime, timezone
    await unit.update({"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}})
    return unit


async def activate_business_unit(tenant_id: PydanticObjectId, unit_id: PydanticObjectId) -> BusinessUnit:
    unit = await get_business_unit(tenant_id, unit_id, include_inactive=True)
    from datetime import datetime, timezone
    await unit.update({"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}})
    return unit


async def count_employees_in_unit(unit_id: PydanticObjectId) -> int:
    return await User.find(
        User.business_unit_id == unit_id,
        User.is_deleted != True,
    ).count()
