"""Evaluate official submissions against the official changeover-cost instances."""

from __future__ import annotations

import re
import tempfile
import zipfile
from pathlib import Path

from backend.core.model.feasibility import verify_solution
from backend.core.model.utils import parse_instance, parse_solution
from backend.paths import OFFICIAL_INSTANCE_COUNT, WITH_CHANGEOVER_INSTANCES_DIR


BIG_M = 100_000_000.0
EXPECTED_INSTANCE_COUNT = OFFICIAL_INSTANCE_COUNT
MAX_ARCHIVE_FILES = 1_000
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
SOLUTION_ID_RE = re.compile(r"^Sol_(?:MPVRP_)?(?P<id>\d{3})(?:_.*)?\.dat$", re.IGNORECASE)


def process_full_submission(zip_path: str) -> dict:
    archive = Path(zip_path)
    try:
        if not archive.is_file():
            return _failed_result(f"ZIP file not found: {archive}")

        official_instances = sorted(WITH_CHANGEOVER_INSTANCES_DIR.glob("MPVRP_*.dat"))
        if len(official_instances) != EXPECTED_INSTANCE_COUNT:
            return _failed_result(
                f"Server benchmark is incomplete: expected {EXPECTED_INSTANCE_COUNT} instances, found {len(official_instances)}."
            )

        with tempfile.TemporaryDirectory(prefix="mpvrp_submission_") as extract_dir:
            extract_root = Path(extract_dir)
            extraction_error = _safe_extract(archive, extract_root)
            if extraction_error:
                return _failed_result(extraction_error)
            submitted, warnings = _index_solutions(extract_root)

            total_score = 0.0
            feasible_count = 0
            details = []
            for instance_path in official_instances:
                instance_id = instance_path.name.split("_")[1]
                solution_path = submitted.get(instance_id)
                errors: list[str] = []
                metrics: dict = {}
                feasible = False

                if solution_path is None:
                    errors = [f"Missing solution for official instance {instance_id}."]
                else:
                    try:
                        instance = parse_instance(str(instance_path))
                        solution = parse_solution(str(solution_path))
                        errors, metrics = verify_solution(instance, solution)
                        feasible = not errors
                    except Exception as exc:
                        errors = [f"Parsing or verification error: {exc}"]

                objective = (
                    float(metrics.get("distance_total", 0))
                    + float(metrics.get("total_switch_cost", 0))
                    if feasible
                    else BIG_M
                )
                total_score += objective
                feasible_count += int(feasible)
                details.append(
                    {
                        "instance": f"Sol_{instance_path.name}",
                        "category": "with_changeover_costs",
                        "feasible": feasible,
                        "distance": float(metrics.get("distance_total", 0)),
                        "transition_cost": float(metrics.get("total_switch_cost", 0)),
                        "errors": errors,
                    }
                )

            return {
                "ok": True,
                "total_weighted_score": total_score,
                "is_fully_feasible": feasible_count == EXPECTED_INSTANCE_COUNT,
                "total_feasible_count": feasible_count,
                "category_stats": {"with_changeover_costs": feasible_count},
                "processor_info": _format_report(submitted, warnings),
                "instance_results": details,
            }
    except Exception as exc:
        return _failed_result(f"Unexpected evaluation error: {exc}")
    finally:
        archive.unlink(missing_ok=True)


def _safe_extract(archive: Path, destination: Path) -> str | None:
    try:
        with zipfile.ZipFile(archive) as bundle:
            members = bundle.infolist()
            if len(members) > MAX_ARCHIVE_FILES:
                return f"Archive contains too many files ({len(members)} > {MAX_ARCHIVE_FILES})."
            if sum(member.file_size for member in members) > MAX_UNCOMPRESSED_BYTES:
                return "Archive is larger than the 100 MB uncompressed limit."
            root = destination.resolve()
            for member in members:
                target = (destination / member.filename).resolve()
                if target != root and root not in target.parents:
                    return f"Unsafe archive path: {member.filename}"
            bundle.extractall(destination)
    except zipfile.BadZipFile:
        return "The submitted file is not a valid ZIP archive."
    return None


def _index_solutions(root: Path) -> tuple[dict[str, Path], list[str]]:
    candidates: dict[str, list[Path]] = {}
    warnings: list[str] = []
    for path in root.rglob("*.dat"):
        match = SOLUTION_ID_RE.match(path.name)
        if match:
            candidates.setdefault(match.group("id"), []).append(path)
        else:
            warnings.append(f"Ignored unrecognized file: {path.name}")
    selected: dict[str, Path] = {}
    for instance_id, paths in candidates.items():
        paths.sort(key=lambda item: (len(item.name), item.as_posix().lower()))
        if len(paths) > 1:
            warnings.append(
                f"Instance {instance_id}: {len(paths)} duplicate candidates found; all were rejected."
            )
            continue
        selected[instance_id] = paths[0]
    return selected, warnings


def _format_report(submitted: dict[str, Path], warnings: list[str]) -> str:
    lines = [f"Recognized solutions: {len(submitted)}/{EXPECTED_INSTANCE_COUNT}."]
    lines.extend(warnings[:20])
    if len(warnings) > 20:
        lines.append(f"… and {len(warnings) - 20} additional warning(s).")
    return "\n".join(lines)


def _failed_result(reason: str) -> dict:
    return {
        "ok": False,
        "total_weighted_score": BIG_M * EXPECTED_INSTANCE_COUNT,
        "is_fully_feasible": False,
        "total_feasible_count": 0,
        "category_stats": {"with_changeover_costs": 0},
        "processor_info": reason,
        "instance_results": [],
    }
