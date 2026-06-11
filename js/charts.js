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
 * Create a win rate trend line chart.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Array} matches - Array of match objects, sorted by start_time ascending
 * @returns {Chart} Chart.js instance
 */
export function createWinRateTrend(canvas, matches) {
    if (!window.Chart) {
        console.warn('Chart.js not loaded');
        return null;
    }

    // Group matches by week
    const buckets = groupMatchesByWeek(matches);

    const labels = buckets.map(b => b.label);
    const winRates = buckets.map(b => b.total > 0
        ? parseFloat((b.wins / b.total * 100).toFixed(1))
        : null
    );
    const gameCounts = buckets.map(b => b.total);

    // Filter out buckets with 0 games
    const validData = labels.map((label, i) => ({
        label, winRate: winRates[i], games: gameCounts[i],
    })).filter(d => d.games > 0);

    return new window.Chart(canvas, {
        type: 'line',
        data: {
            labels: validData.map(d => d.label),
            datasets: [
                {
                    label: '胜率 (%)',
                    data: validData.map(d => d.winRate),
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
                {
                    label: '场次',
                    data: validData.map(d => d.games),
                    borderColor: 'rgba(230, 126, 34, 0.6)',
                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 2,
                    pointBackgroundColor: '#e67e22',
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            ...defaultOptions(),
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
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9098a8',
                        font: { size: 11 },
                        callback: v => v + '%',
                    },
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#e67e22',
                        font: { size: 10 },
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
                            if (ctx.datasetIndex === 0) {
                                return `胜率: ${ctx.parsed.y}%`;
                            }
                            return `场次: ${ctx.parsed.y}`;
                        },
                    },
                },
            },
        },
    });
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

// --- Helpers ---

/**
 * Group matches into weekly buckets.
 * @param {Array} matches - Sorted by start_time ascending
 * @returns {Array<{label: string, wins: number, total: number}>}
 */
function groupMatchesByWeek(matches) {
    if (!matches || matches.length === 0) return [];

    const sorted = [...matches].sort((a, b) => a.start_time - b.start_time);

    // Determine date range
    const firstDate = new Date(sorted[0].start_time * 1000);
    const lastDate = new Date(sorted[sorted.length - 1].start_time * 1000);

    // Create weekly buckets
    const buckets = [];
    const cursor = new Date(firstDate);
    // Align to Monday
    const day = cursor.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setDate(cursor.getDate() + diff);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= lastDate) {
        buckets.push({
            weekStart: new Date(cursor),
            label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
            wins: 0,
            total: 0,
        });
        cursor.setDate(cursor.getDate() + 7);
    }

    // If no buckets created (edge case), create one for the latest week
    if (buckets.length === 0) {
        const d = new Date(lastDate);
        d.setHours(0, 0, 0, 0);
        buckets.push({ weekStart: d, label: `${d.getMonth() + 1}/${d.getDate()}`, wins: 0, total: 0 });
    }

    // Assign matches to buckets
    for (const match of sorted) {
        const matchDate = new Date(match.start_time * 1000);
        // Find the right bucket (the one whose weekStart is <= matchDate < next weekStart)
        for (let i = buckets.length - 1; i >= 0; i--) {
            if (matchDate >= buckets[i].weekStart) {
                buckets[i].total++;
                // Determine if player won
                const isRadiant = match.player_slot < 128;
                if (match.radiant_win === isRadiant) {
                    buckets[i].wins++;
                }
                break;
            }
        }
    }

    return buckets;
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
