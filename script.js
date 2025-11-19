// Configuration
const STORAGE_KEY = "quantum_r_data_v2";
const TARGET_FILENAME = "final_dashboard_data.csv";

document.addEventListener('DOMContentLoaded', () => {
    setupMobileMenu(); // Fungsi baru untuk Mobile

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

// --- FITUR BARU: MOBILE MENU ---
function setupMobileMenu() {
    const menuBtn = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    // Buat overlay element secara dinamis jika belum ada
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (menuBtn && sidebar) {
        // Buka/Tutup saat tombol menu diklik
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });

        // Tutup saat klik di luar (overlay)
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });

        // Tutup saat salah satu link sidebar diklik
        const navLinks = sidebar.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        });
    }
}

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

    // Update UI text
    document.getElementById('fileName').textContent = file.name;

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (validateData(results.data)) {
                saveAndInit(results.data);
                document.getElementById('uploadModal').style.display = 'none';
            } else {
                alert("Invalid CSV format! Ensure columns: Ticker, Return, Volatility, Cluster, company_name");
            }
        }
    });
}

function validateData(data) {
    if (!data || data.length === 0) return false;
    const required = ['Ticker', 'Return', 'Volatility', 'Cluster'];
    const firstRow = data[0];
    return required.every(field => Object.prototype.hasOwnProperty.call(firstRow, field));
}

function saveAndInit(data) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    initializePage(data);
}

function initializePage(data) {
    const page = document.body.getAttribute('data-page');
    
    // Sembunyikan modal jika data loaded
    const modal = document.getElementById('uploadModal');
    if(modal) modal.style.display = 'none';

    if (page === 'dashboard') {
        renderKPIs(data);
        renderScatterPlot(data);
    } else if (page === 'cluster') {
        renderClusterStats(data);
        renderBarChart(data);
    } else if (page === 'datagrid') {
        renderDataGrid(data);
    }
    
    // Auto resize chart saat window berubah ukuran (Penting untuk Mobile)
    window.addEventListener('resize', () => {
        const plots = document.querySelectorAll('.js-plotly-plot');
        plots.forEach(plot => Plotly.Plots.resize(plot));
    });
}

// --- DASHBOARD LOGIC ---
function renderKPIs(data) {
    const totalAssets = data.length;
    const avgReturn = data.reduce((sum, d) => sum + d.Return, 0) / totalAssets;
    const avgVol = data.reduce((sum, d) => sum + d.Volatility, 0) / totalAssets;
    
    // Top Performer
    const top = data.reduce((prev, current) => (prev.Return > current.Return) ? prev : current);

    updateText('total-assets', totalAssets);
    updateText('avg-return', (avgReturn * 100).toFixed(2) + '%');
    updateText('avg-volatility', (avgVol * 100).toFixed(2) + '%');
    updateText('top-performer', `${top.Ticker} (${(top.Return*100).toFixed(1)}%)`);
}

function updateText(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

function renderScatterPlot(data) {
    const container = document.getElementById('scatterPlot');
    if(!container) return;

    // Group data by Cluster
    const clusters = {};
    data.forEach(d => {
        const c = d.Cluster_Label || `Cluster ${d.Cluster}`;
        if (!clusters[c]) clusters[c] = { x: [], y: [], text: [] };
        clusters[c].x.push(d.Volatility);
        clusters[c].y.push(d.Return);
        clusters[c].text.push(`${d.company_name} (${d.Ticker})`);
    });

    const traces = Object.keys(clusters).map(c => ({
        x: clusters[c].x,
        y: clusters[c].y,
        mode: 'markers',
        type: 'scatter',
        name: c,
        text: clusters[c].text,
        marker: { size: 10, opacity: 0.8 }
    }));

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#ffffff' },
        xaxis: { title: 'Annualized Volatility (Risk)', gridcolor: '#2d303e' },
        yaxis: { title: 'Annualized Return', gridcolor: '#2d303e' },
        margin: { t: 30, l: 50, r: 20, b: 50 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 } // Legend di bawah untuk mobile
    };
    
    // Responsive configuration
    const config = { responsive: true };

    Plotly.newPlot('scatterPlot', traces, layout, config);
}

// --- CLUSTER PAGE LOGIC ---
function renderClusterStats(data) {
    // Simple Aggregation Logic
    const section = document.getElementById('clusterStats');
    if(!section) return;
    section.innerHTML = ''; // Clear

    // Get Unique Clusters
    const uniqueClusters = [...new Set(data.map(d => d.Cluster))].sort();

    uniqueClusters.forEach(cId => {
        const clusterData = data.filter(d => d.Cluster == cId);
        const avgRet = clusterData.reduce((s, d) => s + d.Return, 0) / clusterData.length;
        const label = clusterData[0].Cluster_Label || `Cluster ${cId}`;

        section.innerHTML += `
            <div class="card kpi">
                <div class="icon" style="font-size:1.2rem; font-weight:bold;">${cId}</div>
                <div class="details">
                    <h3>${label}</h3>
                    <h2 style="font-size:1.4rem">${(avgRet*100).toFixed(2)}% <span style="font-size:0.8rem; color:#8b92a5">Avg Ret</span></h2>
                    <p style="font-size:0.8rem; color:#8b92a5">${clusterData.length} Assets</p>
                </div>
            </div>
        `;
    });
}

function renderBarChart(data) {
    if(!document.getElementById('barPlot')) return;
    
    const counts = {};
    data.forEach(d => {
        const label = d.Cluster_Label || `Cluster ${d.Cluster}`;
        counts[label] = (counts[label] || 0) + 1;
    });

    const trace = {
        x: Object.keys(counts),
        y: Object.values(counts),
        type: 'bar',
        marker: { color: '#d4af37' }
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#ffffff' },
        margin: { t: 30, l: 30, r: 20, b: 80 }, // Bottom margin lebih besar untuk label
        xaxis: { tickangle: -25 } // Miringkan label agar muat di mobile
    };
    
    const config = { responsive: true };

    Plotly.newPlot('barPlot', [trace], layout, config);
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
                <td><strong>${d.Ticker}</strong></td>
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
