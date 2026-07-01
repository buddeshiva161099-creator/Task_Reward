import asyncio
from app.database.connection import init_db
from app.models.recurring_task import RecurrenceRule
from app.models.task import Task

async def main():
    await init_db()
    rules = await RecurrenceRule.find_all().to_list()
    print(f"Total Recurrence Rules: {len(rules)}")
    for r in rules:
        print(f"\nRule ID: {r.id}")
        print(f"  Name: {r.name}")
        print(f"  Work Description: {r.work_description}")
        print(f"  Is Active: {r.is_active}, Status: {r.status}")
        print(f"  Next Run: {r.next_run}, Last Occurrence: {r.last_occurrence}")
        print(f"  Occurrence Count: {r.occurrence_count}")
        print(f"  Assigned To List: {r.assigned_to_list}")
        
        # Find tasks spawned by this rule
        tasks = await Task.find(Task.recurring_task_id == r.id).to_list()
        print(f"  Spawned Tasks count: {len(tasks)}")
        for t in tasks:
            print(f"    Task ID: {t.id}, Status: {t.status}, Assigned: {t.assigned_to_name} ({t.assigned_to}), Deadline: {t.deadline}")

if __name__ == "__main__":
    asyncio.run(main())
