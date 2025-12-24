// 1. 核心變數
const CLOUD_URL = "https://script.google.com/macros/s/AKfycbwXSauQ1RB-4CQUBHskHuHYmdTERDczNjG-qEhV-jK8ME7lb20ZVum_QW_aNwbEKOKb/exec";
let selectedDate = new Date().toLocaleDateString('sv'); 
let viewDate = new Date();
let mode = 'income'; // 'income' or 'expense'
let db = JSON.parse(localStorage.getItem('snack_db_v12')) || [];
let chartTrend = null;
let chartPie = null; // 新增：圓餅圖變數
let editingId = null;
let reportViewMode = 'month'; 

const categories = {
    income: ['現金收入', 'FoodPanda', 'Uber Eats', '其他收入'],
    expense: {
        '日支出 (經常支出)': ['食材', '耗材', '薪資 (日)', '雜項'],
        '月支出 (浮動支出)': ['米糧', '蔬菜', '火鍋料', '調味料', 'FoodPanda', 'Uber Eats', '稅務', '維修'],
        '月支出 (固定支出)': ['租金', '水費', '電費', '瓦斯類', '電話費', '清潔維護費', '薪資 (月)']
    }
};

// 2. 雲端同步
async function loadCloudData() {
    document.getElementById('loading').style.display = 'flex';
    try {
        const response = await fetch(CLOUD_URL);
        const cloudData = await response.json();
        if (Array.isArray(cloudData)) {
            db = cloudData.map((r, index) => {
                let rawDate = r.date ? String(r.date) : "";
                let cleanDate = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate.substring(0, 10);
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
    } catch (e) { console.error("同步失敗"); }
    finally { document.getElementById('loading').style.display = 'none'; }
}

// 3. 記帳與編輯邏輯
function editRecord(id) {
    const item = db.find(r => r.id == id);
    if (!item) return;
    editingId = id;
    selectedDate = item.date;
    // 這裡會觸發顏色切換
    changeMode(item.type === '收入' ? 'income' : 'expense');
    
    document.getElementById('inputCategory').value = item.category;
    document.getElementById('inputAmount').value = item.amount;
    document.getElementById('inputNote').value = item.note;
    
    document.getElementById('inputCard').classList.add('editing-mode');
    document.getElementById('editNotice').classList.remove('hidden');
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    document.getElementById('deleteBtn').classList.remove('hidden'); // 顯示刪除按鈕
    
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
    document.getElementById('deleteBtn').classList.add('hidden'); // 隱藏刪除按鈕
    updateUI();
}

// 刪除功能
async function deleteRecord() {
    if (!editingId) return;
    if (!confirm("確定要刪除這筆紀錄嗎？(注意：如果Google Apps Script未支援刪除，雲端資料可能需要手動清理)")) return;

    // 1. 本地刪除
    db = db.filter(r => r.id !== editingId);
    localStorage.setItem('snack_db_v12', JSON.stringify(db));

    // 2. 嘗試發送刪除請求 (傳送一個特殊旗標，雖然目前GAS可能只會當作更新，但在前端先做掉)
    // 如果你想讓 GAS 真正刪除，需要在 GAS 端寫判斷 action == 'delete'
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

// 5. 經營報表邏輯
function changeReportView(view) {
    reportViewMode = view;
    const isMonth = view === 'month';
    document.getElementById('view-month').className = isMonth ? "px-4 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-orange-600" : "px-4 py-2 rounded-lg font-bold transition-all text-slate-500";
    document.getElementById('view-week').className = !isMonth ? "px-4 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-orange-600" : "px-4 py-2 rounded-lg font-bold transition-all text-slate-500";
    renderReports();
}

function renderReports() {
    const y = document.getElementById('reportYearSelect').value;
    const m = document.getElementById('reportMonthSelect').value;
    const ctx = document.getElementById('chartYearTrend').getContext('2d');
    const ctxPie = document.getElementById('chartExpensePie').getContext('2d');

    let labels = [], inData = [], outData = [], profitData = [];
    let totalIn = 0, totalOut = 0;
    
    // 圓餅圖數據收集
    let expenseCategoryData = {};

    // 篩選數據邏輯
    const getDataInRange = (dateStr) => {
         const d = new Date(dateStr);
         if(reportViewMode === 'month') {
             return d.getFullYear() == y;
         } else {
             return d.getFullYear() == y && (d.getMonth() + 1) == m;
         }
    };
    
    const targetData = db.filter(r => getDataInRange(r.date));

    // 處理圓餅圖數據 (只統計當前範圍內的支出)
    targetData.forEach(r => {
        if(r.type === '支出') {
            expenseCategoryData[r.category] = (expenseCategoryData[r.category] || 0) + Number(r.amount);
        }
    });

    if (reportViewMode === 'month') {
        document.getElementById('chartMainTitle').innerText = `${y} 年度趨勢 (月線)`;
        for (let i = 1; i <= 12; i++) {
            const prefix = `${y}-${String(i).padStart(2, '0')}`;
            let mi = 0, mo = 0;
            targetData.filter(r => String(r.date).startsWith(prefix)).forEach(r => {
                if (r.type === '收入') mi += Number(r.amount); else mo += Number(r.amount);
            });
            labels.push(`${i}月`); inData.push(mi); outData.push(mo); profitData.push(mi - mo);
            totalIn += mi; totalOut += mo;
        }
    } else {
        document.getElementById('chartMainTitle').innerText = `${y}年 ${m}月 趨勢 (週線)`;
        const weeks = [
            { name: '1-7日', s: 1, e: 7 }, { name: '8-14日', s: 8, e: 14 }, 
            { name: '15-21日', s: 15, e: 21 }, { name: '22日+', s: 22, e: 31 }
        ];
        weeks.forEach(w => {
            let mi = 0, mo = 0;
            targetData.filter(r => {
                const d = new Date(r.date);
                return d.getDate() >= w.s && d.getDate() <= w.e;
            }).forEach(r => {
                if (r.type === '收入') mi += Number(r.amount); else mo += Number(r.amount);
            });
            labels.push(w.name); inData.push(mi); outData.push(mo); profitData.push(mi - mo);
            totalIn += mi; totalOut += mo;
        });
    }

    // 更新數據看板
    document.getElementById('periodStatsBanner').innerHTML = `
        <div class="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl shadow-sm">
            <p class="text-[10px] text-green-600 font-bold uppercase tracking-widest">總收入</p>
            <p class="text-2xl font-black text-green-800">NT$ ${totalIn.toLocaleString()}</p>
        </div>
        <div class="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm">
            <p class="text-[10px] text-red-600 font-bold uppercase tracking-widest">總支出</p>
            <p class="text-2xl font-black text-red-800">NT$ ${totalOut.toLocaleString()}</p>
        </div>
        <div class="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl shadow-sm">
            <p class="text-[10px] text-blue-600 font-bold uppercase tracking-widest">淨利潤</p>
            <p class="text-2xl font-black text-blue-800">NT$ ${(totalIn - totalOut).toLocaleString()}</p>
        </div>
    `;

    // 繪製長條圖
    if (chartTrend) chartTrend.destroy();
    chartTrend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '收入', data: inData, backgroundColor: '#22c55e', borderRadius: 4 },
                { label: '支出', data: outData, backgroundColor: '#ef4444', borderRadius: 4 },
                { label: '純利', data: profitData, type: 'line', borderColor: '#3b82f6', tension: 0.3, borderWidth: 3, pointRadius: 4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 繪製圓餅圖 (Pie Chart)
    if (chartPie) chartPie.destroy();
    // 排序支出類別，取前 6 名，剩下的合併為「其他」
    const sortedExpense = Object.entries(expenseCategoryData).sort((a,b) => b[1] - a[1]);
    let pieLabels = [], pieData = [], pieColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#64748b'];
    
    sortedExpense.slice(0, 6).forEach(item => {
        pieLabels.push(item[0]);
        pieData.push(item[1]);
    });
    if(sortedExpense.length > 6) {
        pieLabels.push('其他');
        pieData.push(sortedExpense.slice(6).reduce((acc, curr) => acc + curr[1], 0));
    }

    if(pieData.length > 0) {
        chartPie = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData,
                    backgroundColor: pieColors,
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } 
                } 
            }
        });
    }
}

// 6. 其他輔助功能
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
    const years = [...new Set(db.map(r => String(r.date).split('-')[0]))];
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

    // 切換卡片背景色
    card.className = `bg-white p-6 rounded-3xl shadow-lg border transition-all duration-300 ${isInc ? 'mode-income-bg' : 'mode-expense-bg'} ${editingId ? 'editing-mode' : ''}`;
    
    // 切換狀態標籤
    statusTag.innerText = isInc ? "收入模式" : "支出模式";
    statusTag.className = `${isInc ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-1 rounded-full text-xs font-bold transition-colors shadow-sm`;

    // 切換按鈕樣式
    btnInc.className = isInc ? "py-4 rounded-xl font-bold mode-income-active shadow-md" : "py-4 rounded-xl font-bold mode-inactive";
    btnExp.className = !isInc ? "py-4 rounded-xl font-bold mode-expense-active shadow-md" : "py-4 rounded-xl font-bold mode-inactive";

    // 切換金額文字顏色
    inputAmt.className = `w-full bg-white border rounded-xl p-5 text-4xl font-black outline-none shadow-inner transition-colors ${isInc ? 'text-income' : 'text-expense'}`;

    updateUI();
}

function selectDate(d) { selectedDate = d; updateUI(); }
function prevMonth() { viewDate.setMonth(viewDate.getMonth() - 1); updateUI(); }
function nextMonth() { viewDate.setMonth(viewDate.getMonth() + 1); updateUI(); }

// 啟動程式
updateUI();
loadCloudData();