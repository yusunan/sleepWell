// ============================================================
// charts.js — Chart.js Chart Configurations
// ============================================================

// Chart.js must be loaded globally via CDN before this module runs.
// We access it via window.Chart.

/**
 * Default Chart.js options shared by all charts.
 */
function defaultOptions(extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#9098a8',
                    font: { size: 12 },
                    padding: 16,
                },
            },
        },
        ...extra,
    };
}

/**
 * Create a hero performance horizontal bar chart.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Array} heroes - Array of hero stat objects, sorted by games desc
 * @param {Map} heroMap - Map of hero_id → { localized_name, name }
 * @param {number} [maxHeroes=10] - Maximum number of heroes to display
 * @returns {Chart} Chart.js instance
 */
export function createHeroPerformanceChart(canvas, heroes, heroMap, maxHeroes = 10) {
    if (!window.Chart) {
        console.warn('Chart.js not loaded');
        return null;
    }

    // Take top N by games (already sorted desc), reverse for bottom-to-top display
    const topHeroes = heroes.slice(0, maxHeroes).reverse();

    const labels = topHeroes.map(h => {
        const name = heroMap.get(h.hero_id);
        return name ? name.localized_name : `Hero ${h.hero_id}`;
    });

    const gameCounts = topHeroes.map(h => h.games || 0);
    const winRates = topHeroes.map(h =>
        h.games > 0 ? parseFloat((h.win / h.games * 100).toFixed(1)) : 0
    );

    // Color bars by win rate: green ≥50%, yellow 45-50%, red <45%, gray for 0%
    const colors = winRates.map(wr => {
        if (wr === 0) return 'rgba(158, 158, 158, 0.5)';
        if (wr >= 50) return 'rgba(76, 175, 80, 0.8)';
        if (wr >= 45) return 'rgba(255, 193, 7, 0.6)';
        return 'rgba(244, 67, 54, 0.7)';
    });

    const borders = winRates.map(wr => {
        if (wr === 0) return '#9e9e9e';
        if (wr >= 50) return '#4caf50';
        if (wr >= 45) return '#ffc107';
        return '#f44336';
    });

    return new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '场次',
                data: gameCounts,
                backgroundColor: colors,
                borderColor: borders,
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            ...defaultOptions(),
            indexAxis: 'y',
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9098a8',
                        font: { size: 11 },
                    },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#e0e0e0',
                        font: { size: 11 },
                    },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const hero = topHeroes[ctx.dataIndex];
                            const wr = hero && hero.games > 0
                                ? (hero.win / hero.games * 100).toFixed(1)
                                : '0.0';
                            return [`场次: ${ctx.parsed.x}`, `胜率: ${wr}%`];
                        },
                    },
                },
            },
        },
    });
}

/**
 * Create an MMR (hidden rating) trend line chart.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Array} history - Array of {ts: unix_ms, mmr: number}, sorted by ts ascending
 * @returns {Chart} Chart.js instance, or null if insufficient data
 */
export function createMmrTrendChart(canvas, history) {
    if (!window.Chart) {
        console.warn('Chart.js not loaded');
        return null;
    }

    if (!history || history.length === 0) return null;

    const labels = history.map(h => {
        const d = new Date(h.ts);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const values = history.map(h => h.mmr);

    // Color based on trend: green if rising, red if falling, neutral otherwise
    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    let lineColor = '#9098a8';
    if (values.length >= 2) {
        if (lastVal > firstVal) lineColor = '#4caf50';
        else if (lastVal < firstVal) lineColor = '#f44336';
    }

    return new window.Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '隐藏分',
                data: values,
                borderColor: lineColor,
                backgroundColor: lineColor.replace(')', ', 0.1)').replace('rgb', 'rgba'),
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                tension: 0.3,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9098a8', font: { size: 11 } },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9098a8',
                        font: { size: 11 },
                        callback: v => Math.round(v).toLocaleString(),
                    },
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#9098a8', font: { size: 12 } },
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            return `隐藏分: ${Math.round(ctx.parsed.y).toLocaleString()}`;
                        },
                    },
                },
            },
        },
    });
}

/**
 * Create a 7-day meta trend line chart for a single hero.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Object} hero - Hero object with { picksTrend, winsTrend }
 * @param {string} heroName - Display name for the chart label
 * @returns {Chart} Chart.js instance
 */
export function createMetaTrendChart(canvas, hero, heroName) {
    if (!window.Chart) {
        console.warn('Chart.js not loaded');
        return null;
    }

    if (!hero) return null;

    const dayLabels = ['6天前', '5天前', '4天前', '3天前', '2天前', '1天前', '今天'];
    const picksTrend = hero.picksTrend || [];
    const winsTrend = hero.winsTrend || [];

    const winRates = [];
    for (let i = 0; i < 7; i++) {
        const dp = picksTrend[i] || 0;
        const dw = winsTrend[i] || 0;
        winRates.push(dp > 0 ? parseFloat((dw / dp * 100).toFixed(1)) : null);
    }

    // Compute dynamic Y-axis range to show fluctuations clearly
    const validRates = winRates.filter(v => v !== null);
    let yMin = 0, yMax = 100;
    if (validRates.length > 0) {
        const dataMin = Math.min(...validRates);
        const dataMax = Math.max(...validRates);
        const range = dataMax - dataMin;
        // Pad by at least 5%, or 2x the range if very flat
        const padding = Math.max(range * 0.8, 5);
        yMin = Math.max(0, Math.floor(dataMin - padding));
        yMax = Math.min(100, Math.ceil(dataMax + padding));
        // Ensure a minimum visual span of 10%
        if (yMax - yMin < 10) {
            const mid = (yMin + yMax) / 2;
            yMin = Math.max(0, Math.floor(mid - 5));
            yMax = Math.min(100, Math.ceil(mid + 5));
        }
    }

    return new window.Chart(canvas, {
        type: 'line',
        data: {
            labels: dayLabels,
            datasets: [
                {
                    label: `${heroName} 胜率 (%)`,
                    data: winRates,
                    borderColor: '#4a90d9',
                    backgroundColor: 'rgba(74, 144, 217, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#4a90d9',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9098a8', font: { size: 11 } },
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: yMin,
                    max: yMax,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9098a8',
                        font: { size: 11 },
                        callback: v => v + '%',
                        stepSize: (yMax - yMin) <= 10 ? 1 : undefined,
                    },
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#9098a8', font: { size: 12 } },
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            return `胜率: ${ctx.parsed.y}%`;
                        },
                    },
                },
            },
        },
    });
}

/**
 * Destroy a Chart.js instance safely.
 */
export function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
    }
}
