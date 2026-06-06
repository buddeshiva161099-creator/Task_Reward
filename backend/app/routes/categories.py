"""
Category management routes - CRUD for task categories.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from app.auth.dependencies import get_current_user, require_admin
from app.auth.tenant_scope import require_tenant_id, get_active_business_unit_id
from app.models.user import User
from app.models.category import Category
from app.models.business_unit import BusinessUnit
from datetime import datetime, timezone
from app.utils.ist_time import to_utc_iso

router = APIRouter(prefix="/categories", tags=["Category Management"])


class CreateCategoryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6366f1")


class UpdateCategoryRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    color: str
    is_active: bool
    created_at: str

    @classmethod
    def from_category(cls, cat: Category) -> "CategoryResponse":
        return cls(
            id=str(cat.id),
            name=cat.name,
            color=cat.color,
            is_active=cat.is_active,
            created_at=to_utc_iso(cat.created_at),
        )


@router.get("", response_model=List[CategoryResponse])
async def list_categories(
    current_user: User = Depends(get_current_user),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """List all categories for the caller's tenant (optionally filtered by active BU)."""
    cid = require_tenant_id(current_user)
    q: dict = {"tenant_id": cid}
    if active_bu_id is not None:
        q["business_unit_id"] = active_bu_id
    else:
        q["$or"] = [{"business_unit_id": None}, {"business_unit_id": {"$exists": False}}]
    categories = await Category.find(q).sort("-created_at").to_list()
    return [CategoryResponse.from_category(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    request: CreateCategoryRequest,
    admin: User = Depends(require_admin),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Create a new category in the caller's tenant (admin only)."""
    cid = require_tenant_id(admin)
    existing = await Category.find_one(Category.tenant_id == cid, Category.name == request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{request.name}' already exists.",
        )

    category = Category(
        tenant_id=cid,
        business_unit_id=active_bu_id,
        name=request.name,
        color=request.color,
    )
    await category.insert()
    return CategoryResponse.from_category(category)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    request: UpdateCategoryRequest,
    admin: User = Depends(require_admin),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Update a category in the caller's tenant (admin only)."""
    from beanie import PydanticObjectId
    cid = require_tenant_id(admin)

    category = await Category.get(PydanticObjectId(category_id))
    if not category or category.tenant_id != cid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    if active_bu_id is not None and category.business_unit_id != active_bu_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found in this business unit",
        )

    update_data = {}
    if request.name is not None:
        existing = await Category.find_one(
            Category.tenant_id == cid,
            Category.name == request.name,
            Category.id != category.id,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category '{request.name}' already exists.",
            )
        update_data["name"] = request.name
    if request.color is not None:
        update_data["color"] = request.color
    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await category.set(update_data)
        category = await Category.get(category.id)

    return CategoryResponse.from_category(category)


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    admin: User = Depends(require_admin),
):
    """Delete a category in the caller's tenant (admin only)."""
    from beanie import PydanticObjectId
    cid = require_tenant_id(admin)

    category = await Category.get(PydanticObjectId(category_id))
    if not category or category.tenant_id != cid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    await category.delete()
    return {"message": "Category deleted successfully"}
