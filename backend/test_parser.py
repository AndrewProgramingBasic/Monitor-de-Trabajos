"""
Automated verification script for committee Excel parser.
Loads CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX, runs it through services/excel_parser.py,
and prints:
  - Detected header row number.
  - Column mapping matches.
  - Total tasks extracted.
  - First 3 parsed tasks showing converted start/end timestamps and rescheduling status.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path so services can be imported directly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.excel_parser import parse_committee_sheet


def run_parser_test() -> dict:
    # Resolve candidate file locations
    candidates = [
        backend_dir.parent / "CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX",
        backend_dir / "CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX",
        Path("../CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX"),
        Path("./CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX"),
    ]

    target_file = next((p for p in candidates if p.exists()), None)
    if not target_file:
        raise FileNotFoundError(
            "Could not locate 'CUADRO COMITE 24 09 2026 JUAN GARCIA.XLSX'. "
            f"Searched in: {[str(c) for c in candidates]}"
        )

    print(f"=== Running Excel Parser Test on: {target_file.name} ===")
    print(f"File Path: {target_file.resolve()}\n")

    # Run parser in dry_run mode (no database writes required)
    result = parse_committee_sheet(
        file_stream=str(target_file),
        filename=target_file.name,
        uploaded_by_user_id=1,
        dry_run=True,
    )

    header_row = result.get("header_row")
    mapping = result.get("column_mapping", {})
    tasks = result.get("tasks", [])
    total_tasks = len(tasks)
    rescheduled_count = result.get("rescheduled_count", 0)

    # 1. Detected header row number
    print(f"1. Detected Header Row Number: {header_row}")

    # 2. Column mapping matches
    print("\n2. Column Mapping Matches:")
    for col_name, col_idx in sorted(mapping.items(), key=lambda item: item[1]):
        print(f"   - {col_name:25} -> Column {col_idx}")

    # 3. Total tasks extracted
    print(f"\n3. Total Tasks Extracted: {total_tasks} (Rescheduled: {rescheduled_count})")

    # 4. First 3 parsed tasks showing converted start/end timestamps and rescheduling status
    print("\n4. First 3 Parsed Tasks:")
    for idx, task in enumerate(tasks[:3], start=1):
        print(f"\n   --- Task #{idx} ---")
        print(f"   Title:                {task['title']}")
        print(f"   CDC Number:           {task['cdc_number']}")
        print(f"   Start Datetime (TZ):  {task['start_datetime']}")
        print(f"   End Datetime (TZ):    {task['end_datetime']}")
        print(f"   Is Rescheduled?:      {task['is_rescheduled']}")
        print(f"   Affectation:          {task['has_affectation']}")
        if task.get("affectation_start") or task.get("affectation_end"):
            print(f"   Aff Start / End:      {task.get('affectation_start')} -> {task.get('affectation_end')}")
        if task.get("vpti_committee_approval") or task.get("managers_approval"):
            print(f"   Approvals (VPTI/Mgr): {task.get('vpti_committee_approval')} / {task.get('managers_approval')}")

    # Validation checks
    assert header_row == 4, f"Expected header row 4, got {header_row}"
    assert total_tasks == 24, f"Expected 24 tasks extracted, got {total_tasks}"
    assert mapping.get("title") is not None, "Title column must be mapped"
    assert mapping.get("start_datetime") is not None, "Start Datetime column must be mapped"
    assert mapping.get("end_datetime") is not None, "End Datetime column must be mapped"
    assert mapping.get("cdc") is not None, "CDC column must be mapped"
    assert rescheduled_count >= 1, "At least 1 rescheduled task must be detected"

    print("\n=== All Verification Assertions Passed Successfully! ===")
    return result


if __name__ == "__main__":
    run_parser_test()

