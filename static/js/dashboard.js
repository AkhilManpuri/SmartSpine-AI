/**
 * dashboard.js
 * Fetches /api/sessions and populates Analytics charts + Health Score
 */

// Global state
let sessionData = [];

// Charts
const trendCtx = document.getElementById('trendChart')?.getContext('2d');
const balanceCtx = document.getElementById('balanceChart')?.getContext('2d');
let trendChart, balanceChart;

function initCharts() {
  if (!trendCtx || !balanceCtx) return;
  
  if (trendChart) trendChart.destroy();
  if (balanceChart) balanceChart.destroy();
  
  Chart.defaults.color = '#6B7C93';
  Chart.defaults.font.family = "'Inter', sans-serif";
  
  const lineGrad = trendCtx.createLinearGradient(0,0,0,300);
  lineGrad.addColorStop(0, 'rgba(42, 125, 225, 0.2)');
  lineGrad.addColorStop(1, 'rgba(42, 125, 225, 0.0)');

  trendChart = new Chart(trendCtx, {
    type: 'line',
    data: { labels: [], datasets: [{
      data: [], fill: true, backgroundColor: lineGrad,
      borderColor: '#2A7DE1', borderWidth: 2, pointRadius: 4,
      pointBackgroundColor: '#2A7DE1', tension: 0.3
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  balanceChart = new Chart(balanceCtx, {
    type: 'bar',
    data: { labels: [], datasets: [
      { label: 'Good (min)', data: [], backgroundColor: '#4FD1C5', borderRadius: 4 },
      { label: 'Bad (min)', data: [], backgroundColor: '#E2E8F0', borderRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth:12 } } },
      scales: {
        x: { grid: { display:false } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function fmtSec(s) {
  if (!s) return '0s';
  if (s < 60) return `${Math.round(s)}s`;
  return `${(s/60).toFixed(1)}m`;
}

function calcHealthScore(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      total: 0,
      consistency: 0,
      adherence: 0,
      frequency: 0,
      trend: 0
    };
  }
  
  // 1. Consistency (35pts) - Avg Score
  const avgScore = sessions.reduce((a,b) => a + (b.posture_score||0), 0) / sessions.length;
  const consistency = Math.min(35, (avgScore / 100) * 35);
  
  // 2. Adherence (30pts) - Good vs Bad ratio
  let goodT = 0, badT = 0;
  sessions.forEach(s => {
    goodT += s.good_posture_time || (s.good_duration_min||0)*60;
    badT += s.bad_posture_time || (s.bad_duration_min||0)*60;
  });
  const totalT = goodT + badT;
  const adhereRatio = totalT > 0 ? (goodT / totalT) : 0;
  const adherence = Math.min(30, adhereRatio * 30);
  
  // 3. Frequency (20pts) - Sessions count (diminishing returns)
  const frequency = Math.min(20, (sessions.length / 50) * 20); // 50 sessions = max freq
  
  // 4. Trend (15pts) - Recent vs Older
  let trend = 7.5; // neutral base
  if (sessions.length >= 2) {
    const r = sessions.slice(-5);
    const o = sessions.slice(0, Math.max(1, sessions.length-5));
    const rA = r.reduce((a,b)=>a+(b.posture_score||0),0)/r.length;
    const oA = o.reduce((a,b)=>a+(b.posture_score||0),0)/o.length;
    if (rA > oA) trend = Math.min(15, trend + ((rA-oA)/10) * 7.5); // bonus
    if (rA < oA) trend = Math.max(0, trend - ((oA-rA)/10) * 7.5);  // penalty
  }
  
  return {
    total: Math.round(consistency + adherence + frequency + trend),
    consistency: Math.round(consistency),
    adherence: Math.round(adherence),
    frequency: Math.round(frequency),
    trend: Math.round(trend)
  };
}

async function fetchAndRender() {
  const totEl = document.getElementById('anTotSessions');
  const avgEl = document.getElementById('anAvgScore');
  const hsTotalEl = document.getElementById('hsTotal');
  const tbody = document.getElementById('analyticsTbody');
  
  if (totEl) totEl.textContent = 'Loading...';
  if (avgEl) avgEl.textContent = 'Loading...';
  if (hsTotalEl) hsTotalEl.textContent = '...';
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Fetching records...</td></tr>`;

  try {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    sessionData = data.sessions || [];
    
    // --- Analytics Tab ---
    const n = sessionData.length;
    document.getElementById('anTotSessions').textContent = n;
    
    // Prevent divide by zero error for avgScore
    const avgScore = n ? sessionData.reduce((a,b)=>a+(b.posture_score||0),0)/n : 0;
    document.getElementById('anAvgScore').textContent = n ? `${Math.round(avgScore)}%` : '--%';
    
    let gSec = 0;
    sessionData.forEach(s => gSec += s.good_posture_time || (s.good_duration_min||0)*60);
    document.getElementById('anGoodTime').textContent = fmtSec(gSec);
    
    // Update Charts (last 20)
    if (trendChart && balanceChart) {
      if (n > 0) {
        const display = sessionData.slice(-20);
        const labels = display.map((s,i) => s.time ? s.time.slice(0,5) : `#${i+1}`);
        const scores = display.map(s => s.posture_score || 0);
        const goods = display.map(s => (s.good_posture_time||0)/60 || s.good_duration_min||0);
        const bads = display.map(s => (s.bad_posture_time||0)/60 || s.bad_duration_min||0);
        
        trendChart.data.labels = labels;
        trendChart.data.datasets[0].data = scores;
        trendChart.update();
        
        balanceChart.data.labels = labels;
        balanceChart.data.datasets[0].data = goods;
        balanceChart.data.datasets[1].data = bads;
        balanceChart.update();
      } else {
        // Clear charts safely
        trendChart.data.labels = [];
        trendChart.data.datasets[0].data = [];
        trendChart.update();
        
        balanceChart.data.labels = [];
        balanceChart.data.datasets[0].data = [];
        balanceChart.data.datasets[1].data = [];
        balanceChart.update();
      }
    }
    
    // Update Table
    if (tbody) {
      if (sessionData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No active session records found. Start monitoring to gather data!</td></tr>`;
      } else {
        tbody.innerHTML = [...sessionData].reverse().map(s => {
          const goodTimeSec = s.good_posture_time || (s.good_duration_min||0)*60;
          const badTimeSec = s.bad_posture_time || (s.bad_duration_min||0)*60;
          const totalTimeSec = goodTimeSec + badTimeSec;
          return `
          <tr>
            <td>${s.date||'--'} <span class="text-muted">${s.time?.slice(0,5)||'--'}</span></td>
            <td><span class="score-badge ${s.posture_score>=75?'high':s.posture_score>=50?'mid':'low'}">${Math.round(s.posture_score||0)}%</span></td>
            <td>${fmtSec(goodTimeSec)}</td>
            <td>${fmtSec(badTimeSec)}</td>
            <td>${fmtSec(totalTimeSec)}</td>
          </tr>
        `}).join('');
      }
    }

    // --- Health Score Tab ---
    const hs = calcHealthScore(sessionData);
    document.getElementById('hsTotal').textContent = hs.total;
    
    const ring = document.getElementById('hsRing');
    if (ring) {
      const offset = 314 - ((hs.total / 100) * 314);
      ring.style.strokeDashoffset = offset;
      
      // Color
      ring.style.stroke = hs.total >= 80 ? 'url(#gradScore)' : 
                          hs.total >= 50 ? 'var(--amber)' : 'var(--red)';
    }
    
    document.getElementById('hsConsistency').textContent = `${hs.consistency}/35`;
    document.getElementById('hsBarConsistency').style.width = `${(hs.consistency/35)*100}%`;
    
    document.getElementById('hsAdherence').textContent = `${hs.adherence}/30`;
    document.getElementById('hsBarAdherence').style.width = `${(hs.adherence/30)*100}%`;
    
    document.getElementById('hsFrequency').textContent = `${hs.frequency}/20`;
    document.getElementById('hsBarFrequency').style.width = `${(hs.frequency/20)*100}%`;
    
    document.getElementById('hsTrend').textContent = `${hs.trend}/15`;
    document.getElementById('hsBarTrend').style.width = `${(hs.trend/15)*100}%`;

  } catch (e) {
    console.error('Failed to load dashboard data', e);
  }
}

// Ensure SVG gradient exists for the ring
document.body.insertAdjacentHTML('beforeend', `
<svg width="0" height="0" style="position:absolute; width:0; height:0;">
  <defs>
    <linearGradient id="gradScore" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4FD1C5" />
      <stop offset="100%" stop-color="#2A7DE1" />
    </linearGradient>
  </defs>
</svg>
`);

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
});

// Hook for app.js router
window.loadDashboardData = async () => {
  await fetchAndRender();
  // Ensure charts reinitialize properly if context changes or to enforce size
  initCharts();
  fetchAndRender(); // Populates initialized charts
};
if (document.getElementById('btnRefreshAnalytics')) {
  document.getElementById('btnRefreshAnalytics').addEventListener('click', window.loadDashboardData);
}
