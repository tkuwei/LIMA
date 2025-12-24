// 1. 核心變數
const CLOUD_URL = "https://script.google.com/macros/s/AKfycbwXSauQ1RB-4CQUBHskHuHYmdTERDczNjG-qEhV-jK8ME7lb20ZVum_QW_aNwbEKOKb/exec";
let selectedDate = new Date().toLocaleDateString('sv'); 
let viewDate = new Date();
let mode = 'income'; 
let db = JSON.parse(localStorage.getItem('snack_db_v12')) || [];
let charts = {}; // 儲存所有圖表實例
let editingId = null;
let reportTrendMode = 'month'; // 'month', 'week', 'day'

const categories = {
    income: ['現金收入', 'FoodPanda', 'Uber Eats', '其他收入'],
    expense: {
        '日支出 (經常支出)': ['食材', '耗材', '薪資 (日)', '雜項'],
        '月支出 (浮動支出)': ['米糧', '蔬菜', '火鍋料', '調味料', 'FoodPanda', 'Uber Eats', '稅務', '維修'],
        '月支出 (固定支出)': ['租金', '水費', '電費', '瓦斯類', '電話費', '清潔維護費', '薪資 (月)']
    }
};

// 2. 雲端同步 (修正日期誤差)
async function loadCloudData() {
    document.getElementById('loading').style.display = 'flex';
    try {
        const response = await fetch(CLOUD_URL);
        const cloudData = await response.json();
        if (Array.isArray(cloudData)) {
            db = cloudData.map((r, index) => {
                // --- 日期修正邏輯 ---
                // 假設 r.date 是 "2023-09-17T16:00:00.000Z" (UTC時間)
                // 我們建立 Date 物件後，強制用台灣時間格式化，再取前10碼
                let dateObj = new Date(r.date);
                // 如果日期無效，就用今天
                if (isNaN(dateObj.getTime())) dateObj = new Date();
                
                // 使用 sv-SE (瑞典) locale 可以直接拿到 YYYY-MM-DD 格式
                // timeZone: 'Asia/Taipei' 確保將 UTC 時間轉回台灣時間 (+8)
                let cleanDate = dateObj.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

                return {
                    ...r,
                    date: cleanDate,
                    amount: Number(r.amount),
                    id: r.id || (Date.now() + index)
                };
            });
            localStorage.setItem('snack_db_v12', JSON.stringify(db));
            updateUI();
        }
    } catch (e) { console.error("同步失敗", e); }
    finally { document.getElementById('loading').style.display = 'none'; }
}

// 3. 記帳與編輯邏輯
function editRecord(id) {
    const item = db.find(r => r.id == id);
    if (!item) return;
    editingId = id;
    selectedDate = item.date;
    changeMode(item.type === '收入' ? 'income' : 'expense');
    
    document.getElementById('inputCategory').value = item.category;
    document.getElementById('inputAmount').value = item.amount;
    document.getElementById('inputNote').value = item.note;
    
    document.getElementById('inputCard').classList.add('editing-mode');
    document.getElementById('editNotice').classList.remove('hidden');
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    document.getElementById('deleteBtn').classList.remove('hidden');
    
    updateUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
    editingId = null;
    document.getElementById('inputAmount').value = '';
    document.getElementById('inputNote').value = '';
    document.getElementById('inputCard').classList.remove('editing-mode');
    document.getElementById('editNotice').classList.add('hidden');
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('deleteBtn').classList.add('hidden');
    updateUI();
}

async function deleteRecord() {
    if (!editingId) return;
    if (!confirm("確定要刪除這筆紀錄嗎？")) return;

    db = db.filter(r => r.id !== editingId);
    localStorage.setItem('snack_db_v12', JSON.stringify(db));

    const payload = { id: editingId, action: 'delete', date: selectedDate };

    document.getElementById('loading').style.display = 'flex';
    try {
         await fetch(CLOUD_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
         resetForm();
    } catch (e) { alert('刪除請求發送失敗'); }
    finally { document.getElementById('loading').style.display = 'none'; }
}

async function saveRecord() {
    const amountInput = document.getElementById('inputAmount');
    const amount = Number(amountInput.value);
    if(amount <= 0) return alert('請輸入金額');

    const payload = { 
        date: selectedDate, 
        type: mode==='income'?'收入':'支出', 
        category: document.getElementById('inputCategory').value, 
        amount: amount, 
        note: document.getElementById('inputNote').value,
        id: editingId || Date.now()
    };

    document.getElementById('loading').style.display = 'flex';
    try {
        if (editingId) {
            const idx = db.findIndex(r => r.id == editingId);
            if(idx !== -1) db[idx] = payload;
        } else { db.push(payload); }
        
        localStorage.setItem('snack_db_v12', JSON.stringify(db));
        await fetch(CLOUD_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        resetForm();
    } catch (e) { alert('儲存失敗'); }
    finally { document.getElementById('loading').style.display = 'none'; }
}

// 4. UI 渲染邏輯
function updateUI() {
    const select = document.getElementById('inputCategory');
    if (mode === 'income') {
        select.innerHTML = categories.income.map(c => `<option value="${c}">${c}</option>`).join('');
    } else {
        let html = '';
        for (const [group, items] of Object.entries(categories.expense)) {
            html += `<optgroup label="${group}">${items.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>`;
        }
        select.innerHTML = html;
    }
    document.getElementById('displaySelectedDate').innerText = selectedDate;
    renderCalendar();
    renderDayDetails();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid'), year = viewDate.getFullYear(), month = viewDate.getMonth();
    grid.innerHTML = ''; 
    document.getElementById('monthDisplay').innerText = `${year}年 ${month + 1}月`;
    const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekdays = ['日','一','二','三','四','五','六'];
    weekdays.forEach(w => grid.innerHTML += `<div class="text-center text-[10px] font-bold text-slate-300 pb-2">${w}</div>`);
    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div></div>`;
    for(let d=1; d<=daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const hasData = db.some(r => String(r.date) === dateStr);
        grid.innerHTML += `<div onclick="selectDate('${dateStr}')" class="day-box ${hasData?'has-data':''} ${selectedDate===dateStr?'day-active':''}">${d}</div>`;
    }
}

function renderDayDetails() {
    const list = document.getElementById('dayDetailList');
    const dayData = db.filter(r => String(r.date).startsWith(selectedDate));
    if(dayData.length === 0) { list.innerHTML = `<p class="text-slate-400 text-sm text-center py-4">無紀錄</p>`; return; }
    list.innerHTML = dayData.map(r => `
        <div onclick="editRecord(${r.id})" class="cursor-pointer group flex justify-between items-center p-3 rounded-xl border transition-all hover:bg-white hover:shadow-sm ${r.type==='收入'?'bg-green-50/50 border-green-100':'bg-red-50/50 border-red-100'}">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded ${r.type==='收入'?'bg-green-200 text-green-700':'bg-red-200 text-red-700'}">${r.category}</span>
                    <span class="font-black text-slate-700">NT$ ${Number(r.amount).toLocaleString()}</span>
                </div>
                <p class="text-xs text-slate-400 mt-1">${r.note || ''}</p>
            </div>
            <i class="fas fa-edit text-slate-200 group-hover:text-orange-400 transition"></i>
        </div>
    `).join('');
}

// 5. 經營報表邏輯 (全新改寫)
function changeReportView(view) {
    reportTrendMode = view;
    ['month', 'week', 'day'].forEach(v => {
        const btn = document.getElementById(`view-${v}`);
        if(v === view) {
            btn.className = "px-4 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-orange-600 border border-orange-100";
        } else {
            btn.className = "px-4 py-2 rounded-lg font-bold transition-all text-slate-500 hover:bg-slate-50";
        }
    });
    
    // 如果是日線，顯示卷軸提示
    const scrollHint = document.getElementById('scrollHint');
    if(view === 'day') scrollHint.classList.remove('hidden');
    else scrollHint.classList.add('hidden');

    renderReports();
}

function renderReports() {
    const y = document.getElementById('reportYearSelect').value;
    const m = document.getElementById('reportMonthSelect').value;
    
    // 清除舊圖表
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};

    // 1. 準備數據
    const yearData = db.filter(r => r.date.startsWith(y));
    const monthData = yearData.filter(r => {
        const d = new Date(r.date);
        return (d.getMonth() + 1) == m;
    });

    // 2. 更新數據總結文字
    updateStatsBanner(yearData, monthData, y, m);

    // 3. 繪製線圖 (趨勢)
    renderTrendChart(yearData, y);

    // 4. 繪製四個圓餅圖
    renderPieChart(yearData, 'chartYearRatio', 'income_expense'); // 年收支
    renderPieChart(yearData, 'chartYearCost', 'cost');           // 年成本
    renderPieChart(monthData, 'chartMonthRatio', 'income_expense');// 月收支
    renderPieChart(monthData, 'chartMonthCost', 'cost');         // 月成本
}

function updateStatsBanner(yearData, monthData, y, m) {
    const calc = (data) => {
        let inc = 0, exp = 0;
        data.forEach(r => { if(r.type==='收入') inc+=r.amount; else exp+=r.amount; });
        return { inc, exp, net: inc - exp };
    };

    const yStat = calc(yearData);
    const mStat = calc(monthData);

    document.getElementById('periodStatsBanner').innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2 text-center text-sm font-bold text-slate-400 mb-1 border-b pb-2">
                ${y}年 總計
            </div>
            <div class="p-3 bg-green-50 rounded-xl">
                <p class="text-[10px] text-green-600 font-bold uppercase">年收入</p>
                <p class="text-lg font-black text-green-800">$${yStat.inc.toLocaleString()}</p>
            </div>
            <div class="p-3 bg-red-50 rounded-xl">
                <p class="text-[10px] text-red-600 font-bold uppercase">年支出</p>
                <p class="text-lg font-black text-red-800">$${yStat.exp.toLocaleString()}</p>
            </div>
            
            <div class="col-span-2 text-center text-sm font-bold text-slate-400 mt-4 mb-1 border-b pb-2">
                ${y}年 ${m}月 小計
            </div>
            <div class="p-3 bg-green-50 rounded-xl border border-green-200">
                <p class="text-[10px] text-green-600 font-bold uppercase">月收入</p>
                <p class="text-lg font-black text-green-800">$${mStat.inc.toLocaleString()}</p>
            </div>
            <div class="p-3 bg-red-50 rounded-xl border border-red-200">
                <p class="text-[10px] text-red-600 font-bold uppercase">月支出</p>
                <p class="text-lg font-black text-red-800">$${mStat.exp.toLocaleString()}</p>
            </div>
        </div>
    `;
}

function renderTrendChart(data, year) {
    const ctx = document.getElementById('chartTrend').getContext('2d');
    let labels = [], inData = [], outData = [];

    // 根據模式產生 Labels (X軸)
    if (reportTrendMode === 'month') {
        labels = Array.from({length: 12}, (_, i) => `${i+1}月`);
        // 初始化數據陣列
        inData = new Array(12).fill(0);
        outData = new Array(12).fill(0);
        data.forEach(r => {
            const monthIdx = new Date(r.date).getMonth();
            if (r.type === '收入') inData[monthIdx] += r.amount;
            else outData[monthIdx] += r.amount;
        });
    } else if (reportTrendMode === 'week') {
        // 週線：計算第幾週 (簡單版，除以7)
        // 為了整年顯示，我們固定顯示 52 週
        labels = Array.from({length: 52}, (_, i) => `W${i+1}`);
        inData = new Array(52).fill(0);
        outData = new Array(52).fill(0);
        data.forEach(r => {
            const d = new Date(r.date);
            const start = new Date(year, 0, 1);
            const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
            const weekIdx = Math.min(Math.floor(days / 7), 51);
            if (r.type === '收入') inData[weekIdx] += r.amount;
            else outData[weekIdx] += r.amount;
        });
    } else if (reportTrendMode === 'day') {
        // 日線：整年顯示 (365天)
        // 這會產生很多點，所以外層容器需要 overflow-x: scroll
        // 為了簡化，我們只產生「有資料」的日期範圍，或者固定產生365天
        // 這裡採用產生整年每一天
        const daysInYear = ((year % 4 === 0 && year % 100 > 0) || year % 400 === 0) ? 366 : 365;
        labels = []; 
        inData = new Array(daysInYear).fill(0);
        outData = new Array(daysInYear).fill(0);
        
        let curr = new Date(year, 0, 1);
        for(let i=0; i<daysInYear; i++) {
            labels.push(`${curr.getMonth()+1}/${curr.getDate()}`);
            const dateStr = curr.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
            // 找出這天的資料
            data.filter(r => r.date === dateStr).forEach(r => {
                if (r.type === '收入') inData[i] += r.amount;
                else outData[i] += r.amount;
            });
            curr.setDate(curr.getDate() + 1);
        }
        
        // 調整圖表容器寬度，讓日線可以橫向捲動
        const container = document.getElementById('chartTrendContainer');
        container.style.width = '2000px'; // 強制寬度，觸發捲動
    }

    // 非日線模式還原寬度
    if(reportTrendMode !== 'day') {
        document.getElementById('chartTrendContainer').style.width = '100%';
    }

    charts['trend'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '收入', data: inData, backgroundColor: '#22c55e', borderRadius: 2 },
                { label: '支出', data: outData, backgroundColor: '#ef4444', borderRadius: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { x: { grid: { display: false } } } // 隱藏X軸網格避免太亂
        }
    });
}

function renderPieChart(data, canvasId, type) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    let finalLabels = [], finalData = [], colors = [];

    if (type === 'income_expense') {
        // 收支比例
        let inc = 0, exp = 0;
        data.forEach(r => { if(r.type==='收入') inc+=r.amount; else exp+=r.amount; });
        finalLabels = ['總收入', '總支出'];
        finalData = [inc, exp];
        colors = ['#22c55e', '#ef4444'];
    } else {
        // 成本比例 (只有支出)
        let catMap = {};
        data.filter(r => r.type === '支出').forEach(r => {
            let catName = r.category;
            // --- 特殊需求：合併薪資 ---
            if (catName === '薪資 (日)' || catName === '薪資 (月)') {
                catName = '薪資';
            }
            catMap[catName] = (catMap[catName] || 0) + r.amount;
        });

        // 排序
        const sorted = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
        const palette = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
        
        finalLabels = sorted.map(i => i[0]);
        finalData = sorted.map(i => i[1]);
        colors = palette.slice(0, finalLabels.length);
    }

    // 如果沒有數據，顯示空
    if(finalData.length === 0 || finalData.every(v => v === 0)) return;

    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: finalLabels,
            datasets: [{
                data: finalData,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
            }
        }
    });
}

// 6. 輔助功能
function switchMainTab(target) {
    document.getElementById('section-record').classList.toggle('hidden', target !== 'record');
    document.getElementById('section-report').classList.toggle('hidden', target !== 'report');
    document.getElementById('tab-record').classList.toggle('tab-active', target === 'record');
    document.getElementById('tab-report').classList.toggle('tab-active', target === 'report');
    if(target === 'report') { initYearMonthOptions(); renderReports(); }
}

function initYearMonthOptions() {
    const ySelect = document.getElementById('reportYearSelect');
    if (ySelect.options.length > 0) return;
    
    // --- 修正：過濾掉非數字的年份 (如 "日期") ---
    const years = [...new Set(db.map(r => r.date.split('-')[0]))]
                  .filter(y => !isNaN(y) && y.length === 4);
    
    const curY = new Date().getFullYear().toString();
    if (!years.includes(curY)) years.push(curY);
    years.sort((a,b)=>b-a);
    ySelect.innerHTML = years.map(y=>`<option value="${y}">${y}年</option>`).join('');
    
    const mSelect = document.getElementById('reportMonthSelect');
    mSelect.innerHTML = Array.from({length:12}, (_,i)=>`<option value="${i+1}">${i+1}月</option>`).join('');
    mSelect.value = (new Date().getMonth()+1).toString();
}

function changeMode(m) {
    mode = m;
    const isInc = m === 'income';
    const card = document.getElementById('inputCard');
    const statusTag = document.getElementById('currentStatusTag');
    const btnInc = document.getElementById('btn-income');
    const btnExp = document.getElementById('btn-expense');
    const inputAmt = document.getElementById('inputAmount');

    card.className = `bg-white p-6 rounded-3xl shadow-lg border transition-all duration-300 ${isInc ? 'mode-income-bg' : 'mode-expense-bg'} ${editingId ? 'editing-mode' : ''}`;
    statusTag.innerText = isInc ? "收入模式" : "支出模式";
    statusTag.className = `${isInc ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-1 rounded-full text-xs font-bold transition-colors shadow-sm`;
    btnInc.className = isInc ? "py-4 rounded-xl font-bold mode-income-active shadow-md" : "py-4 rounded-xl font-bold mode-inactive";
    btnExp.className = !isInc ? "py-4 rounded-xl font-bold mode-expense-active shadow-md" : "py-4 rounded-xl font-bold mode-inactive";
    inputAmt.className = `w-full bg-white border rounded-xl p-5 text-4xl font-black outline-none shadow-inner transition-colors ${isInc ? 'text-income' : 'text-expense'}`;
    updateUI();
}

function selectDate(d) { selectedDate = d; updateUI(); }
function prevMonth() { viewDate.setMonth(viewDate.getMonth() - 1); updateUI(); }
function nextMonth() { viewDate.setMonth(viewDate.getMonth() + 1); updateUI(); }

updateUI();
loadCloudData();