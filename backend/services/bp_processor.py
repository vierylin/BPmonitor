import pandas as pd
import numpy as np
from io import BytesIO

# 欄位對照表 (防呆與容錯)
COLUMN_MAPPING = {
    "date": "Date",
    "日期": "Date",
    "time": "Time",
    "時間": "Time",
    "sbp": "SBP",
    "收縮壓": "SBP",
    "dbp": "DBP",
    "舒張壓": "DBP",
    "hr": "HR",
    "脈搏": "HR",
    "心率": "HR"
}

def process_file(file_content: bytes, filename: str) -> pd.DataFrame:
    """讀取上傳檔案並標準化欄位名稱與格式"""
    if filename.endswith('.csv'):
        df = pd.read_csv(BytesIO(file_content))
    elif filename.endswith('.xlsx'):
        df = pd.read_excel(BytesIO(file_content))
    else:
        raise ValueError("不支援的檔案格式，請上傳 .csv 或 .xlsx")
        
    # 標準化欄位名稱 (轉小寫比對)
    df.columns = [str(col).lower().strip() for col in df.columns]
    new_columns = {}
    for col in df.columns:
        for key, value in COLUMN_MAPPING.items():
            if key in col:
                new_columns[col] = value
                break
    df.rename(columns=new_columns, inplace=True)
    
    # 確保必須欄位存在
    required_cols = ["Date", "Time", "SBP", "DBP", "HR"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"缺少必要欄位: {', '.join(missing_cols)}")
        
    # 清理資料：移除空值列
    df.dropna(subset=required_cols, inplace=True)
    
    # 轉換型態
    df['SBP'] = pd.to_numeric(df['SBP'], errors='coerce')
    df['DBP'] = pd.to_numeric(df['DBP'], errors='coerce')
    df['HR'] = pd.to_numeric(df['HR'], errors='coerce')
    
    # 再次移除轉換失敗的 NaN列
    df.dropna(subset=['SBP', 'DBP', 'HR'], inplace=True)
    
    return df

def filter_extreme_values(df: pd.DataFrame) -> pd.DataFrame:
    """過濾極端異常值"""
    # 依需求規格，保留 SBP 介於 40~300
    df = df[(df['SBP'] >= 40) & (df['SBP'] <= 300)]
    return df

def calculate_map(df: pd.DataFrame) -> pd.DataFrame:
    """計算平均動脈壓 MAP = (SBP + 2*DBP)/3"""
    df['MAP'] = (df['SBP'] + 2 * df['DBP']) / 3
    df['MAP'] = df['MAP'].round(1)
    return df

def assign_period(df: pd.DataFrame) -> pd.DataFrame:
    """根據時間分配 Morning/Evening/Daytime 標籤"""
    # 確保 Time 為字串格式以便分析
    df['Time_str'] = df['Time'].astype(str)
    
    def get_period(time_str):
        try:
            # 簡化處理：取前兩碼為小時
            t = str(time_str).split(':')[0].strip()
            # 處理各種奇特格式
            if ' ' in t:
                t = t.split()[-1]
            if len(t) <= 2:
                hour = int(t)
            else:
                hour = 12 # 預設 fallback
            
            if 6 <= hour < 10:
                return 'Morning'
            elif 18 <= hour < 22:
                return 'Evening'
            else:
                return 'Daytime'
        except Exception:
            return 'Daytime'

    df['period'] = df['Time_str'].apply(get_period)
    return df

def assign_bp_stage(df: pd.DataFrame) -> pd.DataFrame:
    """依據高血壓指引分級"""
    def get_stage(row):
        sbp = row['SBP']
        dbp = row['DBP']
        if sbp < 120 and dbp < 80:
            return 'Normal'
        elif 120 <= sbp < 130 and dbp < 80:
            return 'Prehypertension'  # Elevated
        elif 130 <= sbp < 140 or 80 <= dbp < 90:
            return 'Stage1'
        elif sbp >= 140 or dbp >= 90:
            return 'Stage2'
        else:
            return 'Normal'
            
    df['stage'] = df.apply(get_stage, axis=1)
    return df

def generate_llm_summary(df: pd.DataFrame) -> dict:
    """產生傳給 LLM 的 JSON 數據結構"""
    total_records = len(df)
    
    if total_records == 0:
        return {}
        
    # Patient Summary
    avg_sbp = round(df['SBP'].mean(), 1)
    avg_dbp = round(df['DBP'].mean(), 1)
    avg_hr = round(df['HR'].mean(), 1)
    
    # Morning vs Evening
    morning_df = df[df['period'] == 'Morning']
    evening_df = df[df['period'] == 'Evening']
    
    morning_avg_sbp = round(morning_df['SBP'].mean(), 1) if not morning_df.empty else 0.0
    evening_avg_sbp = round(evening_df['SBP'].mean(), 1) if not evening_df.empty else 0.0
    
    # Non-dipper 判定 (夜間血壓未比日間下降 10-20%) -> 簡化為：夜間血壓反而比日間高出或持平
    is_non_dipper_risk = False
    if morning_avg_sbp > 0 and evening_avg_sbp > 0:
        # 單純以 Evening 是否高於或等於 Morning 作為初步警示 (實務上 Evening 為 18-22，睡前)
        if evening_avg_sbp >= morning_avg_sbp * 0.9: 
             is_non_dipper_risk = True
             
    # Stages Percent
    stage_counts = df['stage'].value_counts(normalize=True) * 100
    normal_pct = round(stage_counts.get('Normal', 0), 1)
    pre_pct = round(stage_counts.get('Prehypertension', 0), 1)
    stage1_pct = round(stage_counts.get('Stage1', 0), 1)
    stage2_pct = round(stage_counts.get('Stage2', 0), 1)
    
    # SPC Alerts (簡易實作 Rule 1: > 3 std)
    mean_sbp = avg_sbp
    std_sbp = df['SBP'].std()
    alerts = []
    
    if pd.notna(std_sbp) and std_sbp > 0:
        ucl = mean_sbp + 3 * std_sbp
        lcl = mean_sbp - 3 * std_sbp
        outliers = df[(df['SBP'] > ucl) | (df['SBP'] < lcl)]
        for _, row in outliers.iterrows():
            date_str = str(row['Date']).split(' ')[0] if 'Date' in row else ''
            alerts.append(f"{date_str} {row['Time']}: SBP {row['SBP']} 超出 3 個標準差")
            
    # 如果 alerts 超過 10 筆，僅取前 10 筆
    alerts = alerts[:10]

    return {
        "patient_summary": {
            "total_records": total_records,
            "avg_sbp": avg_sbp,
            "avg_dbp": avg_dbp,
            "avg_hr": avg_hr
        },
        "morning_vs_evening": {
            "morning_avg_sbp": morning_avg_sbp,
            "evening_avg_sbp": evening_avg_sbp,
            "is_non_dipper_risk": is_non_dipper_risk
        },
        "blood_pressure_stages_percent": {
            "normal": normal_pct,
            "prehypertension": pre_pct,
            "stage1": stage1_pct,
            "stage2": stage2_pct
        },
        "spc_alerts": alerts
    }
