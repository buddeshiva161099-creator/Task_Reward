"""
Search service - cross-collection searching.
"""
from app.models.user import User, UserRole
from app.models.task import Task
from app.models.tenant import Tenant
from typing import List, Dict, Any

async def global_search(query: str, tenant_id: str = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Search across employees, tenants, and tasks.

    Scoping rules:
    - `tenant_id` is None  -> platform owner context: search across ALL tenants.
    - `tenant_id` provided -> tenant context: only return rows in that tenant.
    """
    if not query or len(query) < 2:
        return {"employees": [], "tenants": [], "tasks": []}

    import re
    escaped_query = re.escape(query)
    search_filter = {"$regex": escaped_query, "$options": "i"}

    # 1. Search Employees (always tenant-scoped)
    user_query = [
        User.role == UserRole.EMPLOYEE,
        {"$or": [
            {"name": search_filter},
            {"email": search_filter}
        ]}
    ]
    if tenant_id is not None:
        user_query.append({"tenant_id": tenant_id})

    employees = await User.find(*user_query).limit(5).to_list()

    # 2. Search Companies (cross-tenant only for platform owners)
    if tenant_id is None:
        tenants = await Tenant.find({"name": search_filter}).limit(5).to_list()
    else:
        tenants = await Tenant.find(
            {"name": search_filter, "_id": tenant_id}
        ).limit(5).to_list()

    # 3. Search Tasks (tenant-scoped unless platform owner)
    task_query = {"work_description": search_filter}
    if tenant_id is not None:
        from beanie import PydanticObjectId
        from app.models.company import Company
        tenant_oid = PydanticObjectId(tenant_id)
        companies = await Company.find(Company.tenant_id == tenant_oid).to_list()
        company_ids = [c.id for c in companies]
        tenant_match_ids = [tenant_oid] + company_ids
        task_query["tenant_id"] = {"$in": tenant_match_ids}
    tasks = await Task.find(task_query).limit(5).to_list()

    return {
        "employees": [
            {"id": str(e.id), "name": e.name, "email": e.email, "type": "employee"}
            for e in employees
        ],
        "tenants": [
            {"id": str(c.id), "name": c.name, "type": "tenant"}
            for c in tenants
        ],
        "tasks": [
            {"id": str(t.id), "description": t.work_description, "status": t.status.value, "type": "task"}
            for t in tasks
        ]
    }
