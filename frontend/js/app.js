let globalDetailData = [];
let globalLlmSummary = null;
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    initDOMEvents();
    initCharts();
});

function initDOMEvents() {
    const fileUpload = document.getElementById('file-upload');
    const fileNameDisplay = document.getElementById('file-name-display');
    const uploadForm = document.getElementById('upload-form');
    const btnDemoData = document.getElementById('btn-demo-data');
    const btnExportPdf = document.getElementById('btn-export-pdf');

    fileUpload.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            fileNameDisplay.textContent = `已選擇檔案: ${e.target.files[0].name}`;
            fileNameDisplay.classList.remove('hidden');
        } else {
            fileNameDisplay.classList.add('hidden');
        }
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = fileUpload.files[0];
        if(!file) return;
        
        const apiKey = document.getElementById('api-key').value.trim();
        const formData = new FormData();
        formData.append('file', file);
        if (apiKey) formData.append('api_key', apiKey);
        
        await processData(formData);
    });

    btnDemoData.addEventListener('click', async () => {
        try {
            const fileContent = await fetch('demo_data.csv').then(res => res.text());
            const blob = new Blob([fileContent], { type: 'text/csv' });
            const demoFile = new File([blob], "demo_data.csv", { type: "text/csv" });
            const apiKey = document.getElementById('api-key').value.trim();
            
            const formData = new FormData();
            formData.append('file', demoFile);
            if (apiKey) formData.append('api_key', apiKey);
            
            fileNameDisplay.textContent = `已使用測試資料: demo_data.csv`;
            fileNameDisplay.classList.remove('hidden');
            await processData(formData);
        } catch (e) {
            alert('無法載入本地 demo_data.csv，請確認檔案存在。');
        }
    });
    
    btnExportPdf.addEventListener('click', () => {
        const element = document.getElementById('dashboard-section');
        const opt = {
          margin:       0.5,
          filename:     '血壓分析報告.pdf',
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    });
    
    // Quick Zoom Buttons
    const zoomBtns = document.querySelectorAll('.zoom-btn');
    zoomBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update UI Active State
            zoomBtns.forEach(b => {
                b.classList.remove('bg-white', 'text-blue-600', 'shadow-sm', 'font-bold');
                b.classList.add('text-slate-600', 'font-medium');
            });
            const target = e.target;
            target.classList.remove('text-slate-600', 'font-medium');
            target.classList.add('bg-white', 'text-blue-600', 'shadow-sm', 'font-bold');

            const rangeId = target.id;
            applyQuickZoom(rangeId);
        });
    });
}

function applyQuickZoom(rangeId) {
    if(!globalDetailData || globalDetailData.length === 0 || !charts.trend) return;
    
    let daysToSubtract = 0;
    if(rangeId === 'zoom-7d') daysToSubtract = 7;
    else if(rangeId === 'zoom-1m') daysToSubtract = 30;
    else if(rangeId === 'zoom-3m') daysToSubtract = 90;
    else if(rangeId === 'zoom-1y') daysToSubtract = 365;
    
    // 如果是「全部」或是設定天數大於總天數，則回歸 0-100%
    if(daysToSubtract === 0) {
        charts.trend.dispatchAction({
            type: 'dataZoom',
            start: 0,
            end: 100
        });
        return;
    }
    
    // 取最後一筆資料的日期作為基準
    const lastRecord = globalDetailData[globalDetailData.length - 1];
    const endDate = new Date(lastRecord.Date);
    
    // 計算目標起始日期
    const targetStartDate = new Date(endDate);
    targetStartDate.setDate(endDate.getDate() - daysToSubtract);
    const targetStartStr = targetStartDate.toISOString().split('T')[0];
    
    // 找出大於等於該日期的第一個索引
    let startIdx = 0;
    for(let i=0; i<globalDetailData.length; i++) {
        if(globalDetailData[i].Date >= targetStartStr) {
            startIdx = i;
            break;
        }
    }
    
    const startObj = (startIdx / (globalDetailData.length > 1 ? globalDetailData.length - 1 : 1)) * 100;
    
    charts.trend.dispatchAction({
        type: 'dataZoom',
        start: startObj,
        end: 100
    });
}

async function processData(formData) {
    const errorMsg = document.getElementById('upload-error');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    errorMsg.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || '上傳與解析失敗');
        }
        
        globalDetailData = result.detail_data;
        globalLlmSummary = result.llm_summary;
        
        updateDashboardBaseInfo();
        updateCharts();
        
        // 切換顯示
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        document.getElementById('btn-export-pdf').classList.remove('hidden');
        
        // 確保 div 顯示後再讓 ECharts 重新計算寬高，解決圖表擠在左側的問題
        setTimeout(() => {
            if(charts.trend) charts.trend.resize();
            if(charts.bar) charts.bar.resize();
            if(charts.spc) charts.spc.resize();
        }, 100);
        
        // 觸發 LLM API 呼叫 (Mock it temporarily if not implemented)
        // triggerLLMAnalysis();
        simulateLLMAnalysis(globalLlmSummary);
        
    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.classList.remove('hidden');
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

function updateDashboardBaseInfo() {
    if(!globalLlmSummary) return;
    
    const ps = globalLlmSummary.patient_summary;
    const mve = globalLlmSummary.morning_vs_evening;
    
    document.getElementById('summary-records').textContent = ps.total_records;
    document.getElementById('summary-hr').textContent = ps.avg_hr;
    document.getElementById('summary-bp').textContent = `${ps.avg_sbp} / ${ps.avg_dbp}`;
    document.getElementById('summary-morning').textContent = mve.morning_avg_sbp;
    document.getElementById('summary-evening').textContent = mve.evening_avg_sbp;
    
    const alertEl = document.getElementById('non-dipper-alert');
    if(mve.is_non_dipper_risk) {
        alertEl.classList.remove('hidden');
        alertEl.classList.add('flex');
    } else {
        alertEl.classList.add('hidden');
        alertEl.classList.remove('flex');
    }
    
    const spcContainer = document.getElementById('spc-alerts-container');
    const spcList = document.getElementById('spc-alerts-list');
    spcList.innerHTML = '';
    if(globalLlmSummary.spc_alerts && globalLlmSummary.spc_alerts.length > 0) {
        globalLlmSummary.spc_alerts.forEach(msg => {
            const li = document.createElement('li');
            li.textContent = msg;
            spcList.appendChild(li);
        });
        spcContainer.classList.remove('hidden');
    } else {
        spcContainer.classList.add('hidden');
    }
}

function initCharts() {
    charts.trend = echarts.init(document.getElementById('chart-trend'));
    charts.bar = echarts.init(document.getElementById('chart-bar'));
    charts.spc = echarts.init(document.getElementById('chart-spc'));
    // charts.hr = echarts.init(document.getElementById('chart-hr'));
    
    window.addEventListener('resize', () => {
        charts.trend.resize();
        charts.bar.resize();
        charts.spc.resize();
        // charts.hr.resize();
    });
}

function updateCharts() {
    if(!globalDetailData || globalDetailData.length === 0) return;
    
    // ----------- Trend Chart -----------
    const xData = globalDetailData.map(d => `${d.Date.substring(5)}\n${d.Time}`);
    const sbpData = globalDetailData.map(d => d.SBP);
    const dbpData = globalDetailData.map(d => d.DBP);
    const mapData = globalDetailData.map(d => d.MAP);
    const hrData = globalDetailData.map(d => d.HR);
    
    // ----------- Trend Chart -----------
    charts.trend.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['SBP', 'DBP', 'MAP', 'HR'], textStyle: { fontSize: 14 } },
        grid: { left: '4%', right: '4%', bottom: '12%', top: '10%', containLabel: true },
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { start: 0, end: 100, bottom: 5, height: 25 }
        ],
        xAxis: { type: 'category', data: xData, boundaryGap: false, axisLabel: { fontSize: 12 } },
        yAxis: [
            { 
                type: 'value', min: 40, max: 200, 
                axisLabel: { fontSize: 13 },
                name: "blood pressure (mmHg)",
                nameTextStyle: { color: '#64748b' }
            },
            {
                type: 'value', min: 40, max: 140,
                axisLabel: { fontSize: 13, formatter: '{value} bpm' },
                splitLine: { show: false },
                position: 'right',
                name: "Heart Rate",
                nameTextStyle: { color: '#ec4899' }
            }
        ],
        series: [
            {
                name: 'SBP', type: 'line', data: sbpData, smooth: true,
                symbolSize: 6,
                lineStyle: { width: 3 },
                itemStyle: { color: '#ef4444' },
                markArea: {
                    itemStyle: { color: 'rgba(34, 197, 94, 0.1)' },
                    data: [[{ yAxis: 90 }, { yAxis: 130 }]] // Target range for SBP
                }
            },
            {
                name: 'DBP', type: 'line', data: dbpData, smooth: true,
                symbolSize: 6,
                lineStyle: { width: 3 },
                itemStyle: { color: '#3b82f6' }
            },
            {
                name: 'MAP', type: 'line', data: mapData, smooth: true,
                symbolSize: 2,
                lineStyle: { width: 2, type: 'dashed' },
                itemStyle: { color: '#f59e0b' }
            },
            {
                name: 'HR', type: 'line', data: hrData, smooth: true,
                yAxisIndex: 1, // Use right axis
                symbolSize: 4,
                lineStyle: { width: 2, color: '#ec4899' },
                itemStyle: { color: '#ec4899' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(236,72,153,0.3)' },
                        { offset: 1, color: 'rgba(236,72,153,0.01)' }
                    ])
                }
            }
        ]
    });
    
    // 初始化繪製統計數據面板 (針對整個可見範圍)
    updateStatsPanel(globalDetailData);
    
    // 綁定縮放事件
    charts.trend.on('datazoom', function(params) {
        // 從 dataZoom 擷取目前的 start 與 end 百分比
        // 注意 dispatchAction 時拿到的 params 結構可能會有些微不同
        let startPercent, endPercent;
        if(params.batch) {
            startPercent = params.batch[0].start;
            endPercent = params.batch[0].end;
        } else {
            startPercent = params.start;
            endPercent = params.end;
        }
        
        const startIdx = Math.max(0, Math.floor((startPercent / 100) * globalDetailData.length));
        let endIdx = Math.ceil((endPercent / 100) * globalDetailData.length);
        if(endIdx >= globalDetailData.length) endIdx = globalDetailData.length - 1;
        
        // 擷取目前正在檢視的資料
        const visibleData = globalDetailData.slice(startIdx, endIdx + 1);
        updateStatsPanel(visibleData);
    });
    
    // ----------- Bar Chart -----------
    const stages = globalLlmSummary.blood_pressure_stages_percent;
    charts.bar.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow'} },
        grid: { left: '4%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
        xAxis: { type: 'category', data: ['正常', '前期', 'Stage 1', 'Stage 2'], axisLabel: { fontSize: 13, fontWeight: 'bold' } },
        yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value} %', fontSize: 13 } },
        itemStyle: { borderRadius: [4,4,0,0] },
        series: [
            {
                type: 'bar',
                // Normal=Green, Pre=Yellow, Stage1=Orange, Stage2=Red
                data: [
                    { value: stages.normal, itemStyle: { color: '#22c55e' } },
                    { value: stages.prehypertension, itemStyle: { color: '#eab308' } },
                    { value: stages.stage1, itemStyle: { color: '#f97316' } },
                    { value: stages.stage2, itemStyle: { color: '#ef4444' } }
                ],
                label: { show: true, position: 'top', formatter: '{c}%'}
            }
        ]
    });
    
    // ----------- SPC Chart (SBP) -----------
    const avgSbp = globalLlmSummary.patient_summary.avg_sbp;
    
    // Calc standard dev manually here for visualization
    const mean = avgSbp;
    const variance = sbpData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sbpData.length;
    const std = Math.sqrt(variance);
    const ucl = mean + 3 * std;
    const lcl = mean - 3 * std;
    
    charts.spc.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '6%', bottom: '10%', containLabel: true },
        xAxis: { type: 'category', data: xData },
        yAxis: { type: 'value', min: function(value) { return Math.max(0, Math.floor(value.min - 20)); }},
        series: [
            {
                name: 'SBP', type: 'line', data: sbpData, 
                itemStyle: { color: '#64748b' },
                markLine: {
                    data: [
                        { yAxis: mean, name: 'CL', lineStyle: { color: '#22c55e'} },
                        { yAxis: ucl, name: 'UCL', lineStyle: { color: '#ef4444', type: 'dashed'} },
                        { yAxis: lcl, name: 'LCL', lineStyle: { color: '#ef4444', type: 'dashed'} }
                    ],
                    label: { position: 'end', formatter: '{b}:\n{c}' }
                },
                markPoint: {
                    data: sbpData.map((val, idx) => {
                         if(val > ucl || val < lcl) return { coord: [idx, val], itemStyle: { color: '#ef4444' } };
                         return null;
                    }).filter(x => x !== null)
                }
            }
        ]
    });
}

function updateStatsPanel(dataSlice) {
    const $panel = document.getElementById('stats-panel');
    if (!dataSlice || dataSlice.length === 0) {
        $panel.innerHTML = '<p class="text-xs text-slate-500">無資料</p>';
        return;
    }

    const calcStats = (arr) => {
        if (!arr.length) return { avg: 0, std: 0, min: 0, max: 0, med: 0 };
        const sorted = [...arr].sort((a,b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        const avg = sum / arr.length;
        const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
        const std = Math.sqrt(avgSquareDiff);
        const max = sorted[sorted.length - 1];
        const min = sorted[0];
        const med = sorted.length % 2 !== 0 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        
        return { 
            avg: avg.toFixed(1), 
            std: std.toFixed(1), 
            min: min.toFixed(0), 
            max: max.toFixed(0), 
            med: med.toFixed(1)
        };
    };

    const sbpStats = calcStats(dataSlice.map(d => d.SBP));
    const dbpStats = calcStats(dataSlice.map(d => d.DBP));
    const hrStats = calcStats(dataSlice.map(d => d.HR));

    const renderBlock = (title, colorClass, stats, unit) => `
        <div class="bg-white p-2 rounded shadow-sm border border-slate-100 text-xs">
            <strong class="${colorClass}">${title}</strong>
            <div class="grid grid-cols-2 gap-1 mt-1 text-slate-600 font-medium">
                <div>AVG: <span class="text-slate-800">${stats.avg}</span></div>
                <div>STD: <span class="text-slate-800">${stats.std}</span></div>
                <div>MED: <span class="text-slate-800">${stats.med}</span></div>
                <div>Rng: <span class="text-slate-800">${stats.min}</span> ~ <span class="text-slate-800">${stats.max}</span></div>
            </div>
        </div>
    `;

    $panel.innerHTML = renderBlock('SBP 收縮壓', 'text-red-500', sbpStats, 'mmHg') +
                       renderBlock('DBP 舒張壓', 'text-blue-500', dbpStats, 'mmHg') +
                       renderBlock('HR 心率', 'text-pink-500', hrStats, 'bpm') +
                       `<div class="text-[10px] text-slate-400 text-center mt-2 px-1 text-balance">目前檢視區間：${dataSlice.length} 筆資料</div>`;
}

function simulateLLMAnalysis(summary) {
    // 模擬 LLM 分析回覆以加速開發驗證
    let trendText = `近期的血壓趨勢呈現波動狀態。平均收縮壓為 ${summary.patient_summary.avg_sbp} mmHg，舒張壓為 ${summary.patient_summary.avg_dbp} mmHg。`;
    if(summary.morning_vs_evening.is_non_dipper_risk) {
        trendText += `\n\n特別注意到您的夜間收縮壓 (${summary.morning_vs_evening.evening_avg_sbp} mmHg) 並沒有比日期待顯著下降，這符合臨床上 Non-dipper 甚至 Reverse-dipper 的特徵。`;
    }
    
    let riskText = "";
    if(summary.blood_pressure_stages_percent.stage2 > 20) {
        riskText += "- 超過兩成的時間處於 Stage 2 高血壓狀態，控制不佳。\n";
    }
    if(summary.morning_vs_evening.is_non_dipper_risk) {
        riskText += "- 夜間血壓居高不下，這與心血管疾病風險上升與終端器官受損 (Target Organ Damage) 高度相關，亦可能是睡眠呼吸中止症 (OSAS) 或腎源性高血壓的警訊。\n";
    }
    if(summary.spc_alerts.length > 0) {
        riskText += "- 系統在 SPC 品管圖中偵測到統計上的異常點，可能代表未注意的急性變化。";
    }
    if(riskText === "") riskText = "- 目前各項數據平穩，未見明顯的極端風險訊號。";
    
    let sugText = "1. 考量夜間血壓偏高，建議調整抗高血壓藥物的給藥時間 (例如改為睡前服用 chronotherapy)。\n" +
                  "2. 評估是否有潛在的次發性原因 (如腎功能異常、睡眠呼吸中止)。\n" +
                  "3. 保持居家定時量測，建議採 722 原則 (連續7天、每天早晚2次、每次量2遍)。";
                  
    document.getElementById('llm-core-conclusion').innerText = summary.morning_vs_evening.is_non_dipper_risk ? 
        "血壓達標率偏低，且出現夜間高血壓 (Non-Dipper) 特徵，建議評估睡前給藥。" : "血壓控制尚屬穩定，但請留意長期的微小波動。";
        
    document.getElementById('llm-trend').innerText = trendText;
    document.getElementById('llm-risk').innerText = riskText;
    document.getElementById('llm-suggestion').innerText = sugText;
}
