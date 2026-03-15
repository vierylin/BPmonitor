import fastapi
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas.llm_schema import LLMSchema
from services.bp_processor import (
    process_file,
    filter_extreme_values,
    calculate_map,
    assign_period,
    assign_bp_stage,
    generate_llm_summary
)
import json

app = FastAPI(title="Smart Blood Pressure Dashboard API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Backend is running"}

@app.post("/api/upload")
async def upload_and_process_data(
    file: UploadFile = File(...),
    api_key: str = fastapi.Form(None)
):
    """接收 Excel/CSV 檔案，以及可選的 API Key，進行清洗並回傳前端可繪圖之 JSON 與 LLM 摘要"""
    try:
        content = await file.read()
        df = process_file(content, file.filename)
        df = filter_extreme_values(df)
        df = calculate_map(df)
        df = assign_period(df)
        df = assign_bp_stage(df)
        
        # 產生給前端表格/圖表使用的明細資料 (處理 NaN 以便轉 JSON)
        df_json = df.fillna("").to_dict(orient="records")
        
        # 產生給 LLM 專用的輕量化摘要
        llm_summary_dict = generate_llm_summary(df)
        llm_summary = LLMSchema(**llm_summary_dict)
        
        return {
            "success": True,
            "detail_data": df_json,
            "llm_summary": llm_summary.dict()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
