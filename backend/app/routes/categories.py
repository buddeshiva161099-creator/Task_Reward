"""
Category management routes - CRUD for task categories.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from app.auth.dependencies import get_current_user, require_admin
from app.models.user import User
from app.models.category import Category
from datetime import datetime
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
):
    """List all categories. Available to all authenticated users."""
    categories = await Category.find().sort("-created_at").to_list()
    return [CategoryResponse.from_category(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    request: CreateCategoryRequest,
    admin: User = Depends(require_admin),
):
    """Create a new category (admin only)."""
    # Check for duplicate name
    existing = await Category.find_one(Category.name == request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{request.name}' already exists.",
        )

    category = Category(
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
):
    """Update a category (admin only)."""
    from beanie import PydanticObjectId

    category = await Category.get(PydanticObjectId(category_id))
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    update_data = {}
    if request.name is not None:
        # Check for duplicate name (excluding current)
        existing = await Category.find_one(
            Category.name == request.name, Category.id != category.id
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
        update_data["updated_at"] = datetime.utcnow()
        await category.set(update_data)
        category = await Category.get(category.id)

    return CategoryResponse.from_category(category)


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    admin: User = Depends(require_admin),
):
    """Delete a category (admin only)."""
    from beanie import PydanticObjectId

    category = await Category.get(PydanticObjectId(category_id))
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    await category.delete()
    return {"message": "Category deleted successfully"}
