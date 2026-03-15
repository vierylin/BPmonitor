import pandas as pd
import io
import sys
import json

sys.path.append('.')

from services.bp_processor import process_file, filter_extreme_values, calculate_map, assign_period, assign_bp_stage, generate_llm_summary
from schemas.llm_schema import LLMSchema

# 建立假資料
csv_data = """Date,Time,SBP,DBP,HR
2023-10-01,08:30,145,90,72
2023-10-01,19:00,130,85,68
2023-10-02,07:15,150,95,75
2023-10-02,20:00,128,82,70
2023-10-03,09:00,142,88,74
2023-10-03,18:30,145,92,71
""" # 這裡 10/03 的 Evening(145) > Morning(142)，應該觸發 is_non_dipper_risk

# 測試處理流程
try:
    df = process_file(csv_data.encode('utf-8'), 'test.csv')
    df = filter_extreme_values(df)
    df = calculate_map(df)
    df = assign_period(df)
    df = assign_bp_stage(df)
    
    print("DataFrame Head:")
    print(df.head(10))
    print("-" * 30)
    
    summary_dict = generate_llm_summary(df)
    print("Summary Dict Content:")
    print(json.dumps(summary_dict, indent=2, ensure_ascii=False))
    
    # 測試 Pydantic Schema 驗證
    schema = LLMSchema(**summary_dict)
    print("Pydantic Verification Passed!")
    
except Exception as e:
    print(f"Test Failed: {e}")
