/* ─────────────────────────────────────────
   FinVault — script.js
   Full personal finance dashboard logic
───────────────────────────────────────── */

'use strict';

// ═══════════════════════════════════
//  CONSTANTS & CONFIG
// ═══════════════════════════════════

const INCOME_CATEGORIES  = ['Salary','Bonus','Investment','Other'];
const EXPENSE_CATEGORIES = ['Food','Transport','Fuel','Shopping','Entertainment','Bills','Insurance','Loan','Other'];

const CAT_ICONS = {
  Salary:'💼', Bonus:'🎁', Investment:'📈', Food:'🍔', Transport:'🚌',
  Fuel:'⛽', Shopping:'🛍️', Entertainment:'🎬', Bills:'📋',
  Insurance:'🛡️', Loan:'🏦', Other:'📦'
};

const CHART_COLORS = [
  '#7C3AED','#10B981','#EF4444','#F59E0B','#3B82F6',
  '#EC4899','#14B8A6','#F97316','#8B5CF6','#06B6D4'
];

// ═══════════════════════════════════
//  STATE
// ═══════════════════════════════════

let transactions = [];
let budgets      = {};
let goals        = [];
let charts       = {};
let editingId    = null;

// ═══════════════════════════════════
//  STORAGE
// ═══════════════════════════════════

function saveData() {
  try {
    localStorage.setItem('fv_transactions', JSON.stringify(transactions));
    localStorage.setItem('fv_budgets',      JSON.stringify(budgets));
    localStorage.setItem('fv_goals',        JSON.stringify(goals));
  } catch (e) { console.error('Save failed', e); }
}

function loadData() {
  try {
    transactions = JSON.parse(localStorage.getItem('fv_transactions') || '[]');
    budgets      = JSON.parse(localStorage.getItem('fv_budgets')      || '{}');
    goals        = JSON.parse(localStorage.getItem('fv_goals')        || '[]');
  } catch (e) {
    transactions = []; budgets = {}; goals = [];
  }
}

// ═══════════════════════════════════
//  FORMATTING HELPERS
// ═══════════════════════════════════

function fmt(n) { return 'RM ' + Math.abs(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtSigned(n) { return (n >= 0 ? '+' : '-') + fmt(n); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}); }
function monthKey(d) { return d.slice(0,7); } // "YYYY-MM"
function monthLabel(k) {
  const [y,m] = k.split('-');
  return new Date(+y,+m-1,1).toLocaleString('en-MY',{month:'short',year:'numeric'});
}

// ═══════════════════════════════════
//  AGGREGATE HELPERS
// ═══════════════════════════════════

function sumByType(txList, type) {
  return txList.filter(t=>t.type===type).reduce((s,t)=>s+t.amount, 0);
}

function getMonthTx(month) {  // month = "YYYY-MM" or ""
  if (!month) return transactions;
  return transactions.filter(t => monthKey(t.date) === month);
}

function allMonths() {
  const keys = [...new Set(transactions.map(t=>monthKey(t.date)))].sort();
  return keys;
}

function currentMonth() {
  const p = document.getElementById('monthPicker');
  return p ? p.value : '';
}

// ═══════════════════════════════════
//  DASHBOARD KPIs
// ═══════════════════════════════════

function refreshKPIs() {
  const month = currentMonth();
  const scope = month ? getMonthTx(month) : transactions;

  const income  = sumByType(scope,'income');
  const expense = sumByType(scope,'expense');
  const net     = income - expense;

  // Savings = cumulative all time income - expense
  const allIncome  = sumByType(transactions,'income');
  const allExpense = sumByType(transactions,'expense');
  const savings    = Math.max(0, allIncome - allExpense);

  document.getElementById('kpiIncome').textContent  = fmt(income);
  document.getElementById('kpiExpense').textContent = fmt(expense);
  document.getElementById('kpiSavings').textContent = fmt(savings);
  document.getElementById('kpiNetFlow').textContent = fmt(net);

  const sub = month ? monthLabel(month) : 'All time';
  document.getElementById('kpiIncomeSub').textContent  = sub;
  document.getElementById('kpiExpenseSub').textContent = sub;
  document.getElementById('kpiNetSub').textContent     = 'Income − Expenses';

  // Net flow colour
  const netEl = document.getElementById('kpiNetFlow');
  netEl.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';

  refreshHealthScore(income, expense, savings, allIncome);
}

// ═══════════════════════════════════
//  FINANCIAL HEALTH SCORE + GAUGE
// ═══════════════════════════════════

function refreshHealthScore(income, expense, savings, allIncome) {
  let score = 0;
  const tips = [];

  if (income > 0) {
    const savingRate = income > 0 ? (income - expense) / income : 0;
    const expRatio   = income > 0 ? expense / income : 1;

    // Savings rate (max 40pts)
    if (savingRate >= 0.3)       { score += 40; }
    else if (savingRate >= 0.2)  { score += 30; }
    else if (savingRate >= 0.1)  { score += 20; }
    else if (savingRate >= 0)    { score += 10; }
    else                         { tips.push('⚠️ Spending exceeds income — reduce expenses.'); }

    // Expense ratio (max 30pts)
    if (expRatio <= 0.5)         { score += 30; }
    else if (expRatio <= 0.7)    { score += 20; }
    else if (expRatio <= 0.9)    { score += 10; }
    else                         { tips.push('💡 Try to keep expenses below 70% of income.'); }

    // Transaction diversity (max 15pts)
    const cats = new Set(transactions.filter(t=>t.type==='expense').map(t=>t.category)).size;
    score += Math.min(cats * 3, 15);

    // Positive trend (max 15pts)
    const months = allMonths().slice(-3);
    if (months.length >= 2) {
      const nets = months.map(m => {
        const mtx = getMonthTx(m);
        return sumByType(mtx,'income') - sumByType(mtx,'expense');
      });
      const improving = nets[nets.length-1] >= nets[0];
      if (improving) { score += 15; }
      else { tips.push('📉 Recent cash flow is declining — track spending closely.'); }
    }

    if (savingRate >= 0.2) tips.push('✅ Good savings rate! Keep it up.');
    if (expRatio   <= 0.7) tips.push('✅ Healthy expense-to-income ratio.');
    if (score >= 80)       tips.push('🏆 Excellent financial health!');
  } else {
    tips.push('➕ Add income transactions to calculate your score.');
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  drawGauge(score);

  document.getElementById('gaugeValue').textContent = score;

  const badge = document.getElementById('healthBadge');
  if (score >= 80)      { badge.textContent='Excellent'; badge.className='badge excellent'; }
  else if (score >= 60) { badge.textContent='Good';      badge.className='badge good'; }
  else if (score >= 40) { badge.textContent='Fair';      badge.className='badge fair'; }
  else                  { badge.textContent='Poor';      badge.className='badge poor'; }

  const tipEl = document.getElementById('healthTips');
  if (tips.length) {
    tipEl.innerHTML = '<ul>' + tips.map(t=>`<li>${t}</li>`).join('') + '</ul>';
  } else {
    tipEl.innerHTML = '<p>Add more transactions to get detailed tips.</p>';
  }
}

function drawGauge(score) {
  const canvas = document.getElementById('gaugeCanvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const cx = W/2, cy = H - 10;
  const r  = Math.min(W,H*2)/2 - 14;
  const start = Math.PI, end = 2*Math.PI;

  // BG arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.lineWidth = 18;
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--border2') || '#1A2238';
  ctx.stroke();

  // Value arc
  const pct = score / 100;
  const valEnd = start + pct * Math.PI;
  const gradient = ctx.createLinearGradient(cx-r, cy, cx+r, cy);

  if (score < 40)      { gradient.addColorStop(0,'#EF4444'); gradient.addColorStop(1,'#F97316'); }
  else if (score < 60) { gradient.addColorStop(0,'#F59E0B'); gradient.addColorStop(1,'#EAB308'); }
  else if (score < 80) { gradient.addColorStop(0,'#3B82F6'); gradient.addColorStop(1,'#06B6D4'); }
  else                 { gradient.addColorStop(0,'#7C3AED'); gradient.addColorStop(1,'#10B981'); }

  ctx.beginPath();
  ctx.arc(cx, cy, r, start, valEnd);
  ctx.lineWidth = 18;
  ctx.lineCap   = 'round';
  ctx.strokeStyle = gradient;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i/10)*Math.PI;
    const x1 = cx + (r-12)*Math.cos(a);
    const y1 = cy + (r-12)*Math.sin(a);
    const x2 = cx + (r-3)*Math.cos(a);
    const y2 = cy + (r-3)*Math.sin(a);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    ctx.lineWidth = i%5===0 ? 2 : 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.stroke();
  }
}

// ═══════════════════════════════════
//  RECENT TRANSACTIONS WIDGET
// ═══════════════════════════════════

function refreshRecent() {
  const list = document.getElementById('recentList');
  const recent = [...transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  if (!recent.length) {
    list.innerHTML = '<li class="empty-state">No transactions yet</li>';
    return;
  }
  list.innerHTML = recent.map(t => `
    <li class="recent-item">
      <div class="recent-dot ${t.type}">${CAT_ICONS[t.category]||'📦'}</div>
      <div class="recent-info">
        <div class="recent-desc">${escHtml(t.description)}</div>
        <div class="recent-cat">${t.category} · ${fmtDate(t.date)}</div>
      </div>
      <div class="recent-amt ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
    </li>
  `).join('');
}

// ═══════════════════════════════════
//  MONTHLY SUMMARY CARDS
// ═══════════════════════════════════

function refreshMonthlySummary() {
  const container = document.getElementById('monthlySummary');
  const months = allMonths().slice(-6).reverse();
  if (!months.length) {
    container.innerHTML = '<p class="empty-state">No data available.</p>';
    return;
  }
  container.innerHTML = months.map(m => {
    const tx   = getMonthTx(m);
    const inc  = sumByType(tx,'income');
    const exp  = sumByType(tx,'expense');
    const net  = inc - exp;
    return `
      <div class="month-summary-card">
        <div class="ms-month">${monthLabel(m)}</div>
        <div class="ms-income">↑ ${fmt(inc)}</div>
        <div class="ms-expense">↓ ${fmt(exp)}</div>
        <div class="ms-net" style="color:${net>=0?'var(--income)':'var(--expense)'}">${fmtSigned(net)}</div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════
//  TRANSACTION TABLE
// ═══════════════════════════════════

function refreshTable() {
  const search   = document.getElementById('searchInput').value.toLowerCase();
  const catF     = document.getElementById('filterCategory').value;
  const monthF   = document.getElementById('filterMonth').value;
  const typeF    = document.getElementById('filterType').value;

  let filtered = transactions.filter(t => {
    if (search && !t.description.toLowerCase().includes(search) &&
        !t.category.toLowerCase().includes(search)) return false;
    if (catF   && t.category !== catF)        return false;
    if (monthF && monthKey(t.date) !== monthF) return false;
    if (typeF  && t.type !== typeF)            return false;
    return true;
  }).sort((a,b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('txTableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transactions found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${escHtml(t.description)}</td>
      <td>${CAT_ICONS[t.category]||''} ${t.category}</td>
      <td><span class="type-pill ${t.type}">${capitalize(t.type)}</span></td>
      <td class="amt-cell ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
      <td>
        <button class="action-btn edit" onclick="openEditModal('${t.id}')">✏️ Edit</button>
        <button class="action-btn delete" onclick="deleteTransaction('${t.id}')">🗑</button>
      </td>
    </tr>
  `).join('');
}

function populateFilterOptions() {
  // Category filter
  const catSel = document.getElementById('filterCategory');
  const allCats = [...INCOME_CATEGORIES,...EXPENSE_CATEGORIES];
  catSel.innerHTML = '<option value="">All Categories</option>' +
    [...new Set(allCats)].map(c=>`<option value="${c}">${c}</option>`).join('');

  // Month filter
  const monthSel = document.getElementById('filterMonth');
  const months   = allMonths().reverse();
  monthSel.innerHTML = '<option value="">All Months</option>' +
    months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
}

// ═══════════════════════════════════
//  TRANSACTION MODAL
// ═══════════════════════════════════

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Transaction';
  document.getElementById('txId').value      = '';
  document.getElementById('txDate').value    = new Date().toISOString().slice(0,10);
  document.getElementById('txDesc').value    = '';
  document.getElementById('txAmount').value  = '';
  setTxType('income');
  document.getElementById('txModal').classList.add('open');
}

function openEditModal(id) {
  const t = transactions.find(t=>t.id===id);
  if (!t) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Transaction';
  document.getElementById('txId').value      = id;
  document.getElementById('txDate').value    = t.date;
  document.getElementById('txDesc').value    = t.description;
  document.getElementById('txAmount').value  = t.amount;
  setTxType(t.type);
  populateCategorySelect(t.type, t.category);
  document.getElementById('txModal').classList.add('open');
}

function closeTxModal() {
  document.getElementById('txModal').classList.remove('open');
  editingId = null;
}

function setTxType(type) {
  document.getElementById('txType').value = type;
  document.getElementById('typeIncome').classList.toggle('active', type==='income');
  document.getElementById('typeExpense').classList.toggle('active', type==='expense');
  populateCategorySelect(type);
}

function populateCategorySelect(type, selected='') {
  const cats = type==='income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const sel  = document.getElementById('txCategory');
  sel.innerHTML = cats.map(c=>
    `<option value="${c}" ${c===selected?'selected':''}>${c}</option>`
  ).join('');
}

function saveTransaction() {
  const date   = document.getElementById('txDate').value;
  const desc   = document.getElementById('txDesc').value.trim();
  const type   = document.getElementById('txType').value;
  const cat    = document.getElementById('txCategory').value;
  const amount = parseFloat(document.getElementById('txAmount').value);

  if (!date || !desc || !cat || isNaN(amount) || amount <= 0) {
    showToast('Please fill all fields correctly.','error');
    return;
  }

  if (editingId) {
    const idx = transactions.findIndex(t=>t.id===editingId);
    if (idx > -1) {
      transactions[idx] = { ...transactions[idx], date, description:desc, type, category:cat, amount };
      showToast('Transaction updated.','success');
    }
  } else {
    transactions.push({ id: genId(), date, description:desc, type, category:cat, amount, createdAt: Date.now() });
    showToast('Transaction added.','success');
  }

  saveData();
  closeTxModal();
  refreshAll();
  checkBudgetAlerts();
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter(t=>t.id!==id);
  saveData();
  refreshAll();
  showToast('Transaction deleted.','warning');
}

// ═══════════════════════════════════
//  CHARTS
// ═══════════════════════════════════

function getChartTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  return {
    text:  theme==='light' ? '#1E293B' : '#E2E8F0',
    grid:  theme==='light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    bg:    theme==='light' ? 'rgba(255,255,255,0.5)' : 'rgba(19,25,41,0.5)',
  };
}

function refreshCharts() {
  const months = allMonths().slice(-6);
  const ct = getChartTheme();

  // ── Bar Chart: Income vs Expense ──
  const barLabels = months.map(monthLabel);
  const barIncome  = months.map(m => sumByType(getMonthTx(m),'income'));
  const barExpense = months.map(m => sumByType(getMonthTx(m),'expense'));

  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [
        { label:'Income',  data:barIncome,  backgroundColor:'rgba(16,185,129,0.75)', borderRadius:6, borderSkipped:false },
        { label:'Expense', data:barExpense, backgroundColor:'rgba(239,68,68,0.75)',  borderRadius:6, borderSkipped:false }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ labels:{ color:ct.text, font:{family:'Inter',size:12} }},
        tooltip:{ callbacks:{ label: ctx => ` ${fmt(ctx.raw)}` }}
      },
      scales: {
        x: { ticks:{color:ct.text}, grid:{color:ct.grid} },
        y: { ticks:{color:ct.text, callback:v=>fmt(v)}, grid:{color:ct.grid} }
      }
    }
  });

  // ── Pie Chart: Expense Breakdown ──
  const expCats = {};
  transactions.filter(t=>t.type==='expense').forEach(t => {
    expCats[t.category] = (expCats[t.category]||0) + t.amount;
  });
  const pieLabels = Object.keys(expCats);
  const pieData   = Object.values(expCats);

  if (charts.pie) charts.pie.destroy();
  if (pieLabels.length) {
    charts.pie = new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets:[{
          data: pieData,
          backgroundColor: CHART_COLORS.slice(0, pieLabels.length),
          borderWidth: 2,
          borderColor: ct.bg
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        cutout:'62%',
        plugins:{
          legend:{ position:'right', labels:{ color:ct.text, font:{family:'Inter',size:11}, boxWidth:12, padding:10 }},
          tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` }}
        }
      }
    });
  }

  // ── Line Chart: Savings Trend ──
  const savingsData = months.map(m => {
    const txUpTo = transactions.filter(t=>monthKey(t.date)<=m);
    return Math.max(0, sumByType(txUpTo,'income') - sumByType(txUpTo,'expense'));
  });

  if (charts.line) charts.line.destroy();
  charts.line = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: barLabels,
      datasets:[{
        label:'Cumulative Savings',
        data: savingsData,
        borderColor:'#7C3AED',
        backgroundColor:'rgba(124,58,237,0.12)',
        borderWidth:2.5,
        pointBackgroundColor:'#7C3AED',
        pointRadius:5,
        fill:true,
        tension:0.4
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:ct.text, font:{family:'Inter',size:12} }},
        tooltip:{ callbacks:{ label: ctx => ` ${fmt(ctx.raw)}` }}
      },
      scales:{
        x:{ ticks:{color:ct.text}, grid:{color:ct.grid} },
        y:{ ticks:{color:ct.text, callback:v=>fmt(v)}, grid:{color:ct.grid} }
      }
    }
  });
}

// ═══════════════════════════════════
//  BUDGET
// ═══════════════════════════════════

function openBudgetModal() {
  document.getElementById('budgetAmount').value = '';
  document.getElementById('budgetModal').classList.add('open');
}
function closeBudgetModal() { document.getElementById('budgetModal').classList.remove('open'); }

function saveBudget() {
  const cat    = document.getElementById('budgetCategory').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);
  if (!cat || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount.','error'); return; }
  budgets[cat] = amount;
  saveData();
  closeBudgetModal();
  refreshBudget();
  checkBudgetAlerts();
  showToast(`Budget set for ${cat}.`,'success');
}

function refreshBudget() {
  const container = document.getElementById('budgetList');
  const cats = Object.keys(budgets);
  if (!cats.length) {
    container.innerHTML = '<p class="empty-state">No budgets set yet.</p>';
    return;
  }
  const month = currentMonth() || new Date().toISOString().slice(0,7);
  const monthTx = getMonthTx(month);

  container.innerHTML = cats.map(cat => {
    const limit = budgets[cat];
    const spent = monthTx.filter(t=>t.type==='expense'&&t.category===cat).reduce((s,t)=>s+t.amount,0);
    const pct   = Math.min((spent/limit)*100, 100);
    const cls   = pct>=100?'danger':pct>=80?'warning':'ok';
    return `
      <div class="budget-item">
        <div class="budget-item-header">
          <span class="budget-cat">${CAT_ICONS[cat]||''} ${cat}</span>
          <span class="budget-meta">${fmt(spent)} / ${fmt(limit)}</span>
        </div>
        <div class="budget-bar"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:.35rem">
          <span style="font-size:.72rem;color:var(--text-muted)">${Math.round(pct)}% used</span>
          <button class="action-btn delete" onclick="deleteBudget('${cat}')">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteBudget(cat) {
  delete budgets[cat];
  saveData();
  refreshBudget();
  refreshAlerts();
}

function checkBudgetAlerts() {
  const month   = currentMonth() || new Date().toISOString().slice(0,7);
  const monthTx = getMonthTx(month);
  const alerts  = [];

  Object.entries(budgets).forEach(([cat, limit]) => {
    const spent = monthTx.filter(t=>t.type==='expense'&&t.category===cat).reduce((s,t)=>s+t.amount,0);
    const pct   = (spent/limit)*100;
    if (pct >= 100) alerts.push({ type:'danger', msg:`🚨 <strong>${cat}</strong> budget exceeded! Spent ${fmt(spent)} of ${fmt(limit)}.` });
    else if (pct >= 80) alerts.push({ type:'warn', msg:`⚠️ <strong>${cat}</strong> is at ${Math.round(pct)}% of budget.` });
  });

  refreshAlerts(alerts);
}

function refreshAlerts(alerts) {
  const container = document.getElementById('alertsList');
  if (!alerts) {
    checkBudgetAlerts();
    return;
  }
  if (!alerts.length) {
    container.innerHTML = '<p class="empty-state">No alerts. Budgets on track ✅</p>';
    return;
  }
  container.innerHTML = alerts.map((a,i) => `
    <div class="alert-item ${a.type}">
      <span>${a.msg}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════
//  GOALS
// ═══════════════════════════════════

function openGoalModal() {
  document.getElementById('goalName').value   = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalSaved').value  = '';
  document.getElementById('goalDate').value   = '';
  document.getElementById('goalModal').classList.add('open');
}
function closeGoalModal() { document.getElementById('goalModal').classList.remove('open'); }

function saveGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value) || 0;
  const date   = document.getElementById('goalDate').value;

  if (!name || isNaN(target) || target <= 0) { showToast('Enter goal name and target.','error'); return; }
  goals.push({ id:genId(), name, target, saved, date });
  saveData();
  closeGoalModal();
  refreshGoals();
  showToast('Goal added!','success');
}

function refreshGoals() {
  const container = document.getElementById('goalsList');
  if (!goals.length) {
    container.innerHTML = '<p class="empty-state">No goals yet. Start saving!</p>';
    return;
  }
  container.innerHTML = goals.map(g => {
    const pct  = Math.min((g.saved/g.target)*100,100);
    const left = Math.max(0,g.target-g.saved);
    const days = g.date ? Math.ceil((new Date(g.date)-new Date())/86400000) : null;
    return `
      <div class="goal-card">
        <button class="goal-del" onclick="deleteGoal('${g.id}')">✕</button>
        <div class="goal-name">${escHtml(g.name)}</div>
        <div class="goal-amounts">
          <span>Saved: ${fmt(g.saved)}</span>
          <span>Target: ${fmt(g.target)}</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
        <div class="goal-pct">${Math.round(pct)}% complete</div>
        ${left>0?`<div class="goal-date">RM ${fmt(left)} remaining${days!==null?` · ${days} days left`:''}</div>`:'<div class="goal-date" style="color:var(--income)">🎉 Goal reached!</div>'}
      </div>
    `;
  }).join('');
}

function deleteGoal(id) {
  goals = goals.filter(g=>g.id!==id);
  saveData();
  refreshGoals();
}

// ═══════════════════════════════════
//  REPORTS
// ═══════════════════════════════════

function refreshReport() {
  const month   = currentMonth() || new Date().toISOString().slice(0,7);
  const monthTx = getMonthTx(month);
  const income  = sumByType(monthTx,'income');
  const expense = sumByType(monthTx,'expense');
  const net     = income - expense;

  // Category breakdown
  const catMap = {};
  monthTx.filter(t=>t.type==='expense').forEach(t=>{
    catMap[t.category]=(catMap[t.category]||0)+t.amount;
  });

  const catRows = Object.entries(catMap).sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`<div class="report-row"><span class="label">${CAT_ICONS[c]||''} ${c}</span><span class="value">${fmt(v)}</span></div>`)
    .join('');

  // Income breakdown
  const incMap = {};
  monthTx.filter(t=>t.type==='income').forEach(t=>{
    incMap[t.category]=(incMap[t.category]||0)+t.amount;
  });
  const incRows = Object.entries(incMap).sort((a,b)=>b[1]-a[1])
    .map(([c,v])=>`<div class="report-row"><span class="label">${CAT_ICONS[c]||''} ${c}</span><span class="value positive">${fmt(v)}</span></div>`)
    .join('');

  document.getElementById('reportContent').innerHTML = `
    <div class="report-section">
      <div class="report-title">📊 Summary — ${monthLabel(month)}</div>
      <div class="report-row"><span class="label">Total Income</span><span class="value positive">${fmt(income)}</span></div>
      <div class="report-row"><span class="label">Total Expenses</span><span class="value negative">${fmt(expense)}</span></div>
      <div class="report-row"><span class="label">Net Cash Flow</span><span class="value ${net>=0?'positive':'negative'}">${fmtSigned(net)}</span></div>
      <div class="report-row"><span class="label">Transactions</span><span class="value">${monthTx.length}</span></div>
    </div>
    ${incRows?`<div class="report-section"><div class="report-title">💰 Income Breakdown</div>${incRows}</div>`:''}
    ${catRows?`<div class="report-section"><div class="report-title">💸 Expense Breakdown</div>${catRows}</div>`:''}
  `;
}

// ═══════════════════════════════════
//  EXPORT
// ═══════════════════════════════════

function exportCSV() {
  const month   = currentMonth();
  const data    = month ? getMonthTx(month) : transactions;
  const header  = ['Date','Description','Category','Type','Amount (RM)'];
  const rows    = data.sort((a,b)=>b.date.localeCompare(a.date))
    .map(t=>[t.date, `"${t.description.replace(/"/g,'""')}"`, t.category, t.type, t.amount.toFixed(2)]);

  const csv = [header, ...rows].map(r=>r.join(',')).join('\n');
  downloadFile('finvault-transactions.csv', csv, 'text/csv;charset=utf-8;');
  showToast('CSV exported!','success');
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('PDF library not loaded.','error'); return; }

  const month   = currentMonth() || new Date().toISOString().slice(0,7);
  const monthTx = getMonthTx(month);
  const income  = sumByType(monthTx,'income');
  const expense = sumByType(monthTx,'expense');
  const net     = income - expense;

  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  let y = 20;

  // Header
  doc.setFillColor(124,58,237);
  doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('FinVault — Financial Report', 15, 18);

  y = 38;
  doc.setTextColor(30,41,59);
  doc.setFontSize(12);
  doc.setFont('helvetica','bold');
  doc.text(`Period: ${monthLabel(month)}`, 15, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica','normal');
  doc.setTextColor(100,116,139);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, y);

  y += 12;
  const drawRow = (label, value, color=[30,41,59]) => {
    doc.setFont('helvetica','normal'); doc.setTextColor(100,116,139); doc.setFontSize(10);
    doc.text(label, 15, y);
    doc.setFont('helvetica','bold'); doc.setTextColor(...color); doc.setFontSize(10);
    doc.text(value, 130, y, {align:'right'});
    doc.setDrawColor(226,232,240); doc.line(15, y+2, 195, y+2);
    y += 9;
  };

  doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59); doc.setFontSize(12);
  doc.text('Summary', 15, y); y += 8;

  drawRow('Total Income',  `RM ${income.toFixed(2)}`,  [16,185,129]);
  drawRow('Total Expenses',`RM ${expense.toFixed(2)}`, [239,68,68]);
  drawRow('Net Cash Flow', `RM ${net.toFixed(2)}`,     net>=0?[16,185,129]:[239,68,68]);
  drawRow('Transactions',  `${monthTx.length}`);

  y += 6;
  doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59); doc.setFontSize(12);
  doc.text('Transactions', 15, y); y += 8;

  const sorted = [...monthTx].sort((a,b)=>b.date.localeCompare(a.date));
  sorted.slice(0,30).forEach(t => {
    if (y > 270) { doc.addPage(); y = 20; }
    drawRow(`${t.date}  ${t.description} (${t.category})`,
      `${t.type==='income'?'+':'-'}RM ${t.amount.toFixed(2)}`,
      t.type==='income'?[16,185,129]:[239,68,68]);
  });

  doc.save(`finvault-report-${month}.pdf`);
  showToast('PDF exported!','success');
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════

const SECTION_LABELS = {
  dashboard:'Dashboard', transactions:'Transactions',
  charts:'Analytics', budget:'Budget',
  goals:'Goals', reports:'Reports'
};

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));

  const el = document.getElementById(`section-${section}`);
  if (el) el.classList.add('active');

  const navEl = document.querySelector(`[data-section="${section}"]`);
  if (navEl) navEl.classList.add('active');

  document.getElementById('pageTitle').textContent = SECTION_LABELS[section]||section;

  // Lazy-render section-specific things
  if (section==='charts')       refreshCharts();
  if (section==='budget')       refreshBudget();
  if (section==='goals')        refreshGoals();
  if (section==='reports')      refreshReport();

  // Close sidebar on mobile
  closeSidebar();
}

// ═══════════════════════════════════
//  THEME
// ═══════════════════════════════════

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('fv_theme', theme);
  document.querySelector('.theme-label').textContent = theme==='dark' ? 'Dark Mode' : 'Light Mode';
  // Refresh charts to update colors
  const active = document.querySelector('.section.active');
  if (active && active.id==='section-charts') refreshCharts();
}

function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme');
  applyTheme(curr==='dark'?'light':'dark');
}

// ═══════════════════════════════════
//  SIDEBAR MOBILE
// ═══════════════════════════════════

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ═══════════════════════════════════
//  TOAST
// ═══════════════════════════════════

let toastTimer;
function showToast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 3000);
}

// ═══════════════════════════════════
//  HELPERS
// ═══════════════════════════════════

function genId() { return Math.random().toString(36).slice(2,11); }
function escHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ═══════════════════════════════════
//  GLOBAL REFRESH
// ═══════════════════════════════════

function refreshAll() {
  refreshKPIs();
  refreshRecent();
  refreshMonthlySummary();
  refreshTable();
  populateFilterOptions();

  const active = document.querySelector('.section.active');
  if (active) {
    const id = active.id.replace('section-','');
    if (id==='charts')  refreshCharts();
    if (id==='budget')  { refreshBudget(); checkBudgetAlerts(); }
    if (id==='goals')   refreshGoals();
    if (id==='reports') refreshReport();
  }
}

// ═══════════════════════════════════
//  SEED DEMO DATA
// ═══════════════════════════════════

function seedDemoData() {
  if (transactions.length) return; // already have data

  const now   = new Date();
  const y     = now.getFullYear();
  const m     = String(now.getMonth()+1).padStart(2,'0');
  const pm    = String(now.getMonth()).padStart(2,'0') || '12';
  const py    = now.getMonth()===0 ? y-1 : y;

  const add = (date,desc,cat,type,amount) =>
    transactions.push({id:genId(),date,description:desc,category:cat,type,amount,createdAt:Date.now()});

  // Current month
  add(`${y}-${m}-01`,'Monthly Salary','Salary','income',6500);
  add(`${y}-${m}-03`,'Grocery Shopping','Food','expense',320);
  add(`${y}-${m}-05`,'Petrol','Fuel','expense',150);
  add(`${y}-${m}-07`,'Electricity Bill','Bills','expense',180);
  add(`${y}-${m}-10`,'Netflix','Entertainment','expense',55);
  add(`${y}-${m}-12`,'Bonus Payout','Bonus','income',1000);
  add(`${y}-${m}-14`,'Car Insurance','Insurance','expense',220);
  add(`${y}-${m}-16`,'Grab rides','Transport','expense',85);
  add(`${y}-${m}-18`,'Shopee purchases','Shopping','expense',430);
  add(`${y}-${m}-20`,'Home Loan','Loan','expense',1200);
  add(`${y}-${m}-22`,'Freelance project','Other','income',800);

  // Previous month
  add(`${py}-${pm}-01`,'Monthly Salary','Salary','income',6500);
  add(`${py}-${pm}-04`,'Food delivery','Food','expense',280);
  add(`${py}-${pm}-06`,'Petrol','Fuel','expense',130);
  add(`${py}-${pm}-08`,'Internet Bill','Bills','expense',99);
  add(`${py}-${pm}-12`,'Movie tickets','Entertainment','expense',60);
  add(`${py}-${pm}-15`,'Investment dividend','Investment','income',350);
  add(`${py}-${pm}-18`,'Shopping mall','Shopping','expense',560);
  add(`${py}-${pm}-20`,'Home Loan','Loan','expense',1200);
  add(`${py}-${pm}-25`,'Medical Insurance','Insurance','expense',200);

  budgets['Food']          = 500;
  budgets['Entertainment'] = 100;
  budgets['Shopping']      = 400;

  goals.push({id:genId(),name:'Emergency Fund',target:10000,saved:3500,date:`${y+1}-06-01`});
  goals.push({id:genId(),name:'Holiday — Japan',target:8000,saved:2200,date:`${y+1}-03-01`});

  saveData();
}

// ═══════════════════════════════════
//  INIT
// ═══════════════════════════════════

function init() {
  // Load stored data
  loadData();

  // Apply stored theme
  const savedTheme = localStorage.getItem('fv_theme') || 'dark';
  applyTheme(savedTheme);

  // Seed demo if empty
  seedDemoData();

  // Set default month picker to current month
  const mp = document.getElementById('monthPicker');
  if (mp) {
    const now = new Date();
    mp.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    mp.addEventListener('change', ()=>refreshAll());
  }

  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(n.dataset.section);
    });
  });

  // Sidebar "View all" link
  document.querySelectorAll('[data-section]').forEach(a => {
    a.addEventListener('click', e => {
      if (a.classList.contains('link-sm')) {
        e.preventDefault();
        navigateTo(a.dataset.section);
      }
    });
  });

  // Hamburger / sidebar overlay
  const sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  sidebarOverlay.id = 'sidebarOverlay';
  document.body.appendChild(sidebarOverlay);
  sidebarOverlay.addEventListener('click', closeSidebar);
  document.getElementById('hamburger').addEventListener('click', openSidebar);

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Add transaction button
  document.getElementById('openAddModal').addEventListener('click', openAddModal);

  // Type toggle buttons
  document.getElementById('typeIncome').addEventListener('click',  ()=>{ setTxType('income');  populateCategorySelect('income'); });
  document.getElementById('typeExpense').addEventListener('click', ()=>{ setTxType('expense'); populateCategorySelect('expense'); });

  // Modal close / cancel
  document.getElementById('closeTxModal').addEventListener('click',  closeTxModal);
  document.getElementById('cancelTxModal').addEventListener('click', closeTxModal);
  document.getElementById('saveTx').addEventListener('click', saveTransaction);

  // Budget modal
  document.getElementById('openBudgetModal').addEventListener('click',   openBudgetModal);
  document.getElementById('closeBudgetModal').addEventListener('click',  closeBudgetModal);
  document.getElementById('cancelBudgetModal').addEventListener('click', closeBudgetModal);
  document.getElementById('saveBudget').addEventListener('click', saveBudget);

  // Goal modal
  document.getElementById('openGoalModal').addEventListener('click',   openGoalModal);
  document.getElementById('closeGoalModal').addEventListener('click',  closeGoalModal);
  document.getElementById('cancelGoalModal').addEventListener('click', closeGoalModal);
  document.getElementById('saveGoal').addEventListener('click', saveGoal);

  // Search / filter
  ['searchInput','filterCategory','filterMonth','filterType'].forEach(id => {
    document.getElementById(id)?.addEventListener('input',  refreshTable);
    document.getElementById(id)?.addEventListener('change', refreshTable);
  });

  // Reports exports
  document.getElementById('exportCSV').addEventListener('click', exportCSV);
  document.getElementById('exportPDF').addEventListener('click', exportPDF);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Initial render
  populateCategorySelect('income');
  refreshAll();
  checkBudgetAlerts();

  // Draw gauge after paint
  requestAnimationFrame(()=>drawGauge(0));
}

document.addEventListener('DOMContentLoaded', init);
