// Configuration
const STORAGE_KEY = "quantum_r_data_v2";
const TARGET_FILENAME = "final_dashboard_data.csv";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cek apakah data sudah ada di memory
    const storedData = sessionStorage.getItem(STORAGE_KEY);
    
    if (storedData) {
        initializePage(JSON.parse(storedData));
    } else {
        // 2. Jika belum, coba load otomatis
        tryAutoLoad();
    }

    // 3. Listener untuk Upload Manual
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleManualUpload);
    }
});

function tryAutoLoad() {
    Papa.parse(TARGET_FILENAME, {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (validateData(results.data)) {
                saveAndInit(results.data);
            } else {
                console.warn("Auto-load failed validation. Waiting for manual upload.");
                showModal();
            }
        },
        error: function(err) {
            console.warn("Auto-load error (CORS/File Missing). Showing modal.");
            showModal();
        }
    });
}

function handleManualUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    document.getElementById('fileName').innerText = file.name;

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (validateData(results.data)) {
                hideModal();
                saveAndInit(results.data);
            } else {
                alert("Format File Salah! Pastikan kolom 'Ticker' dan 'Cluster' ada di CSV.");
            }
        },
        error: function(err) { alert("Error reading file: " + err.message); }
    });
}

// --- DATA VALIDATION & NORMALIZATION (THE FIX) ---

function validateData(data) {
    if (!data || data.length === 0) return false;
    const row = data[0];
    
    // Cek ketersediaan kolom (Case Insensitive)
    const hasTicker = row.Ticker !== undefined || row.ticker !== undefined;
    const hasReturn = row.Return !== undefined || row.return !== undefined;
    
    return hasTicker && hasReturn;
}

function normalizeData(rawData) {
    // Fungsi ini menstandarisasi nama kolom agar JS bisa membacanya
    return rawData.map(row => ({
        ticker: row.Ticker || row.ticker,
        company_name: row.company_name || row.Company_Name || row.Name || row.name,
        Return: (row.Return !== undefined) ? row.Return : row.return,
        Volatility: (row.Volatility !== undefined) ? row.Volatility : row.volatility,
        Cluster: (row.Cluster !== undefined) ? row.Cluster : row.cluster,
        Cluster_Label: row.Cluster_Label || row.cluster_label || ("Cluster " + (row.Cluster || row.cluster))
    })).filter(d => d.ticker); // Hapus baris kosong
}

function saveAndInit(rawData) {
    const cleanData = normalizeData(rawData);
    
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
    } catch (e) { console.warn("SessionStorage Full"); }
    
    initializePage(cleanData);
}

function initializePage(data) {
    const metrics = calculateMetrics(data);
    const pageType = document.body.getAttribute('data-page');
    
    updateHeaderMetrics(metrics);

    if (pageType === 'dashboard') renderDashboard(data, metrics);
    else if (pageType === 'cluster') renderClusterPage(data);
    else if (pageType === 'datagrid') renderDataGrid(data);
}

// --- CALCULATIONS ---
function calculateMetrics(data) {
    if (!data.length) return { avgRet: 0, avgVol: 0, total: 0, topTicker: '-' };

    const avgRet = data.reduce((s, i) => s + i.Return, 0) / data.length;
    const avgVol = data.reduce((s, i) => s + i.Volatility, 0) / data.length;
    // Cari Top Performer
    const top = data.reduce((prev, curr) => (prev.Return > curr.Return) ? prev : curr, data[0]);

    return {
        avgRet: avgRet,
        avgVol: avgVol,
        total: data.length,
        topTicker: top ? top.ticker : "-"
    };
}

// --- RENDERING ---
function updateHeaderMetrics(metrics) {
    const el = document.getElementById('total-assets');
    if(el) el.innerText = metrics.total;
}

function renderDashboard(data, metrics) {
    document.getElementById('avg-return').innerText = (metrics.avgRet * 100).toFixed(2) + "%";
    document.getElementById('avg-volatility').innerText = (metrics.avgVol * 100).toFixed(2) + "%";
    document.getElementById('top-performer').innerText = metrics.topTicker;

    const trace = {
        x: data.map(d => d.Volatility),
        y: data.map(d => d.Return),
        text: data.map(d => `<b>${d.ticker}</b><br>${d.company_name}<br>${d.Cluster_Label}`),
        mode: 'markers',
        marker: {
            size: 9,
            color: data.map(d => d.Cluster), // Warna berdasarkan ID Cluster
            colorscale: 'Portland',
            showscale: false,
            line: { color: '#1c1e2a', width: 0.5 }
        },
        type: 'scatter'
    };
    
    const layout = {
        title: { text: 'Risk vs Return Landscape', font: { color: '#fff', family: 'Cinzel', size: 18 } },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { title: 'Volatility (Risk)', color: '#8b92a5', gridcolor: '#2d303e' },
        yaxis: { title: 'Annual Return', color: '#8b92a5', gridcolor: '#2d303e' },
        hovermode: 'closest'
    };
    Plotly.newPlot('scatterPlot', [trace], layout);
}

function renderClusterPage(data) {
    const counts = {};
    data.forEach(d => { 
        const label = d.Cluster_Label;
        counts[label] = (counts[label] || 0) + 1; 
    });

    const statsDiv = document.getElementById('clusterStats');
    if(statsDiv) {
        statsDiv.innerHTML = '';
        Object.keys(counts).forEach(key => {
            statsDiv.innerHTML += `
                <div class="card kpi">
                    <div class="details" style="width:100%">
                        <h3 style="font-size:0.8rem; margin-bottom:5px; color:#aa8c2c">${key}</h3>
                        <h2 style="font-size:1.4rem">${counts[key]} Assets</h2>
                    </div>
                </div>
            `;
        });
    }

    const trace = {
        x: Object.keys(counts),
        y: Object.values(counts),
        type: 'bar',
        marker: { color: '#d4af37' }
    };
    const layout = {
        title: { text: 'Cluster Distribution', font: { color: '#fff', family: 'Cinzel' } },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { color: '#8b92a5' }, yaxis: { color: '#8b92a5', gridcolor: '#2d303e' }
    };
    Plotly.newPlot('barPlot', [trace], layout);
}

function renderDataGrid(data) {
    const tbody = document.getElementById('tableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    data.forEach(d => {
        const colorClass = d.Return >= 0 ? 'text-gold' : 'text-muted';
        const statusColor = d.Return > 0 ? '#4caf50' : '#ef5350';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.ticker}</strong></td>
                <td>${d.company_name}</td>
                <td>${d.Cluster_Label}</td>
                <td class="${colorClass}">${(d.Return * 100).toFixed(2)}%</td>
                <td>${(d.Volatility * 100).toFixed(2)}%</td>
                <td><span style="color:${statusColor}">●</span></td>
            </tr>
        `;
    });

    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('keyup', function() {
            const val = this.value.toLowerCase();
            const rows = tbody.getElementsByTagName('tr');
            for (let row of rows) {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(val) ? '' : 'none';
            }
        });
    }
}

// UI Helpers
function showModal() { document.getElementById('uploadModal').style.display = 'flex'; }
function hideModal() { document.getElementById('uploadModal').style.display = 'none'; }