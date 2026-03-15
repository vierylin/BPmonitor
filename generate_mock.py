import pandas as pd
import numpy as np
import datetime

# 設定起迄時間 (3個月，約90天)
end_date = datetime.datetime.strptime("2023-10-31", "%Y-%m-%d")
start_date = end_date - datetime.timedelta(days=90)

dates = []
for i in range(91):
    dates.append(start_date + datetime.timedelta(days=i))

data = []

# 模擬一個漸進控制不佳的患者，且具備 Non-dipper 傾向
base_sbp_morning = 135
base_dbp_morning = 85
base_sbp_evening = 132 # 晚間未顯著下降
base_dbp_evening = 82
base_hr = 72

for d in dates:
    date_str = d.strftime("%Y-%m-%d")
    
    # 隨著時間微幅上升 (模擬三個月間趨勢惡化)
    trend_factor = (d - start_date).days * 0.15 
    
    # 加入隨機擾動
    # 早晨數據
    m_sbp = int(base_sbp_morning + trend_factor + np.random.normal(0, 8))
    m_dbp = int(base_dbp_morning + (trend_factor * 0.5) + np.random.normal(0, 5))
    m_hr = int(base_hr + np.random.normal(0, 4))
    
    # 確保極端值仍落在合理範疇內
    data.append([date_str, "08:00", max(80, min(m_sbp, 220)), max(50, min(m_dbp, 130)), max(40, min(m_hr, 120))])
    
    # 晚間數據 (偶爾忘記量)
    if np.random.random() > 0.1: 
        e_sbp = int(base_sbp_evening + trend_factor + np.random.normal(2, 7)) # 晚間微幅高一點
        e_dbp = int(base_dbp_evening + (trend_factor * 0.5) + np.random.normal(0, 5))
        e_hr = int(base_hr + 2 + np.random.normal(0, 5))
        data.append([date_str, "20:00", max(80, min(e_sbp, 220)), max(50, min(e_dbp, 130)), max(40, min(e_hr, 120))])

df = pd.DataFrame(data, columns=["Date", "Time", "SBP", "DBP", "HR"])
df.to_csv("demo_data.csv", index=False)
print(f"Generated {len(df)} records spanning 3 months in demo_data.csv")
