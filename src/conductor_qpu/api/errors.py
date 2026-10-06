"""Stable control-plane error codes.

HTTP 4xx/5xx bodies use FastAPI's ``{"detail": {"code", "message"}}`` shape.
In-band tool failures on ``POST /goals`` stay HTTP 200 with ``results[].error``
and ``error_code`` so existing UI clients keep working.
"""

from __future__ import annotations

from enum import StrEnum

from fastapi import HTTPException


class ErrorCode(StrEnum):
    """Machine-readable codes for finance/audit clients."""

    INVALID_JOB_ID = "INVALID_JOB_ID"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"
    QUBIT_NOT_FOUND = "QUBIT_NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CALIBRATION_MUTATION_FORBIDDEN = "CALIBRATION_MUTATION_FORBIDDEN"
    GOAL_STEP_FAILED = "GOAL_STEP_FAILED"
    UNKNOWN_TOOL = "UNKNOWN_TOOL"
    BELL_NO_RESULT = "BELL_NO_RESULT"


def api_error(status: int, code: ErrorCode, message: str) -> HTTPException:
    """Raise-ready HTTPException with a structured ``detail`` object."""
    return HTTPException(
        status_code=status,
        detail={"code": code.value, "message": message},
    )
