from pydantic import BaseModel
from typing import List, Optional

class PatientSummary(BaseModel):
    total_records: int
    avg_sbp: float
    avg_dbp: float
    avg_hr: float

class MorningVsEvening(BaseModel):
    morning_avg_sbp: float
    evening_avg_sbp: float
    is_non_dipper_risk: bool

class BloodPressureStagesPercent(BaseModel):
    normal: float
    prehypertension: float
    stage1: float
    stage2: float

class LLMSchema(BaseModel):
    patient_summary: PatientSummary
    morning_vs_evening: MorningVsEvening
    blood_pressure_stages_percent: BloodPressureStagesPercent
    spc_alerts: List[str]
