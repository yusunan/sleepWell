// ============================================================
// ui.js — DOM Rendering Functions
// ============================================================

import { RANK_MEDALS, LOBBY_NAMES, REGION_NAMES, RATE_LIMIT, PATCH_VERSIONS } from './config.js';

// --- Tiny DOM Builder ---

/** Create an element with attributes and children. */
function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'dataset') {
            for (const [dk, dv] of Object.entries(value)) {
                el.dataset[dk] = dv;
            }
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'style' && typeof value === 'object') {
            for (const [sk, sv] of Object.entries(value)) {
                el.style[sk] = sv;
            }
        } else {
            el.setAttribute(key, value);
        }
    }
    if (typeof children === 'string') {
        el.textContent = children;
    } else if (Array.isArray(children)) {
        for (const child of children) {
            if (child instanceof Node) {
                el.appendChild(child);
            } else if (child != null) {
                el.appendChild(document.createTextNode(String(child)));
            }
        }
    }
    return el;
}

// --- Section References ---

function $(id) {
    return document.getElementById(id);
}

// --- Loading / Error / Empty States ---

export function showLoading(sectionId, message = '加载中...') {
    const section = $(sectionId);
    if (!section) return;
    section.innerHTML = `
        <div class="state-loading">
            <div class="spinner"></div>
            <p class="state-text">${escapeHtml(message)}</p>
        </div>
    `;
}

export function showError(sectionId, message, onRetry = null) {
    const section = $(sectionId);
    if (!section) return;
    section.innerHTML = `
        <div class="state-error">
            <div class="state-icon">⚠️</div>
            <p class="state-text">${escapeHtml(message)}</p>
            ${onRetry ? '<button class="btn btn-retry" data-action="retry">重试</button>' : ''}
        </div>
    `;
    if (onRetry) {
        const btn = section.querySelector('[data-action="retry"]');
        if (btn) btn.addEventListener('click', onRetry);
    }
}

export function showEmpty(sectionId, message) {
    const section = $(sectionId);
    if (!section) return;
    section.innerHTML = `
        <div class="state-empty">
            <div class="state-icon">📭</div>
            <p class="state-text">${escapeHtml(message)}</p>
        </div>
    `;
}

// --- Dashboard Toggle ---

export function showDashboard(visible = true) {
    const dashboard = $('dashboard');
    const header = $('search-section');
    if (dashboard) {
        if (visible) {
            dashboard.classList.add('loaded');
        } else {
            dashboard.classList.remove('loaded');
        }
    }
    if (header && visible) {
        header.classList.add('has-data');
    } else if (header) {
        header.classList.remove('has-data');
    }
}

// --- Player Profile ---

export function renderPlayerProfile(containerId, profile) {
    const container = $(containerId);
    if (!container) return;

    const avatarUrl = profile.profile?.avatarfull || profile.profile?.avatarmedium || '';
    const personaName = profile.profile?.personaname || '匿名玩家';
    const steamId = profile.profile?.account_id || '';
    const profileUrl = profile.profile?.profileurl || `https://steamcommunity.com/profiles/${steamId}`;

    // Rank badge — display raw rank_tier value
    const rankTier = profile.rank_tier || 0;
    const rankName = rankTier > 0 ? String(rankTier) : '未校准';

    // Rank icon image
    const rankIcon = rankTier > 0
        ? `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${rankTier}.png`
        : null;

    container.innerHTML = `
        <div class="player-profile">
            <div class="profile-avatar avatar-text">
                ${escapeHtml(personaName[0] || '?')}
            </div>
            <div class="profile-info">
                <h2 class="profile-name">${escapeHtml(personaName)}</h2>
                <div class="profile-meta">
                    <span class="profile-id">Steam ID: ${steamId}</span>
                    <a href="${profileUrl}" target="_blank" rel="noopener" class="profile-link">Steam 资料 →</a>
                </div>
            </div>
            <div class="profile-rank">
                <span class="rank-name">${rankTier}</span>
            </div>
        </div>
    `;
}

// --- Turbo Summary Cards ---

export function renderTurboSummary(containerId, stats) {
    const container = $(containerId);
    if (!container) return;

    const {
        totalGames = 0,
        wins = 0,
        losses = 0,
        winRate = 0,
        avgKills = 0,
        avgDeaths = 0,
        avgAssists = 0,
        avgGpm = 0,
        avgXpm = 0,
        radiantWR = 0,
        direWR = 0,
        coreGames = 0,
        supportGames = 0,
        computedMmrTurbo = null,
    } = stats;

    const kda = avgDeaths > 0
        ? ((avgKills + avgAssists) / avgDeaths).toFixed(1)
        : (avgKills + avgAssists).toFixed(1);

    const mmrValue = computedMmrTurbo != null ? Math.round(computedMmrTurbo).toLocaleString() : '未校准';

    const cards = [
        { icon: '🎮', label: '加速模式场次', value: totalGames.toLocaleString(), color: '' },
        { icon: '🏆', label: '胜率', value: winRate.toFixed(1) + '%', color: winRate >= 50 ? 'win' : 'loss' },
        { icon: '📊', label: '隐藏分(加速)', value: mmrValue, color: '' },
        { icon: '☀️', label: '天辉方胜率', value: radiantWR.toFixed(1) + '%', color: radiantWR >= 50 ? 'win' : 'loss' },
        { icon: '🌙', label: '夜魇方胜率', value: direWR.toFixed(1) + '%', color: direWR >= 50 ? 'win' : 'loss' },
        { icon: '⚔️', label: '场均 KDA', value: kda, color: '' },
        { icon: '💰', label: '平均 GPM', value: Math.round(avgGpm).toLocaleString(), color: '' },
        { icon: '⚡', label: '平均 XPM', value: Math.round(avgXpm).toLocaleString(), color: '' },
        { icon: '🎯', label: '核心/辅助比', value: supportGames > 0 ? (coreGames / supportGames).toFixed(0) + ':1' : '纯核心', color: '' },
    ];

    container.innerHTML = `
        <div class="summary-grid">
            ${cards.map(c => `
                <div class="summary-card">
                    <div class="card-icon">${c.icon}</div>
                    <div class="card-value ${c.color}">${c.value}</div>
                    <div class="card-label">${c.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// --- Hero Table ---

export let heroTableSort = { field: 'games', asc: false };
export let matchTableSort = { field: 'time', asc: false };
export let peersTableSort = { field: 'games', asc: false };

// Store last rendered data for re-sort without re-fetch
let lastMatchesData = null;
let lastMatchesHeroMap = null;
let lastPeersData = null;
export function renderHeroTable(containerId, heroes, heroMap, onSortChange) {
    const container = $(containerId);
    if (!container) return;

    if (!heroes || heroes.length === 0) {
        showEmpty(containerId, '暂无加速模式英雄数据');
        return;
    }

    // Sort heroes
    const sorted = [...heroes].sort((a, b) => {
        if (heroTableSort.field === 'hero') {
            const aName = (heroMap.get(a.hero_id)?.localized_name || '');
            const bName = (heroMap.get(b.hero_id)?.localized_name || '');
            const cmp = aName.localeCompare(bName, 'zh');
            return heroTableSort.asc ? cmp : -cmp;
        }
        const aVal = getHeroField(a, heroTableSort.field);
        const bVal = getHeroField(b, heroTableSort.field);
        if (heroTableSort.asc) return aVal - bVal;
        return bVal - aVal;
    });

    const columns = [
        { key: 'hero', label: '英雄', sortable: true },
        { key: 'games', label: '场次', sortable: true },
        { key: 'winrate', label: '胜率', sortable: true },
    ];

    const sortIndicator = (key) => {
        if (heroTableSort.field !== key) return '';
        return heroTableSort.asc ? ' ▲' : ' ▼';
    };

    container.innerHTML = `
        <div class="hero-table-wrapper">
            <table class="data-table hero-table">
                <thead>
                    <tr>
                        ${columns.map(c => `
                            <th class="${c.sortable ? 'sortable' : ''} col-${c.key}"
                                ${c.sortable ? `data-sort="${c.key}"` : ''}>
                                ${c.label}${sortIndicator(c.key)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(h => renderHeroRow(h, heroMap)).join('')}
                </tbody>
            </table>
        </div>
        <div class="hero-count">共 ${heroes.length} 个英雄</div>
    `;

    // Attach sort handlers
    const headers = container.querySelectorAll('th.sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (heroTableSort.field === field) {
                heroTableSort.asc = !heroTableSort.asc;
            } else {
                heroTableSort.field = field;
                heroTableSort.asc = false;
            }
            if (onSortChange) onSortChange();
        });
    });

    // Attach hero row click for detail (optional)
    const rows = container.querySelectorAll('.hero-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const heroId = row.dataset.heroId;
            // Toggle highlight
            rows.forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            // Emit custom event for detail panel
            container.dispatchEvent(new CustomEvent('hero-select', {
                detail: { heroId: parseInt(heroId) },
                bubbles: true,
            }));
        });
    });
}

function renderHeroRow(hero, heroMap) {
    const heroName = heroMap.get(hero.hero_id);
    const name = heroName ? heroName.localized_name : `Hero ${hero.hero_id}`;
    const iconUrl = heroName
        ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroName.name}.png`
        : '';

    const games = hero.games || 0;
    const wins = hero.win || 0;
    const wr = games > 0 ? ((wins / games) * 100).toFixed(1) : '0.0';
    const wrClass = parseFloat(wr) >= 55 ? 'wr-good' : parseFloat(wr) >= 45 ? 'wr-avg' : 'wr-bad';

    return `
        <tr class="hero-row" data-hero-id="${hero.hero_id}">
            <td class="col-hero">
                <div class="hero-cell">
                    ${iconUrl ? `<img src="${iconUrl}" alt="${name}" class="hero-icon-sm" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="hero-icon-fallback">${escapeHtml(name[0])}</span>` : `<span class="hero-icon-fallback">${escapeHtml(name[0])}</span>`}
                    <span>${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="col-games">${games}</td>
            <td class="col-winrate ${wrClass}">${wr}%</td>
        </tr>
    `;
}

function getHeroField(hero, field) {
    const games = hero.games || 1;
    switch (field) {
        case 'games': return hero.games || 0;
        case 'winrate': return games > 0 ? (hero.win || 0) / games : 0;
        default: return 0;
    }
}

// --- Recent Matches Table ---

export function renderRecentMatches(containerId, matches, heroMap) {
    const container = $(containerId);
    if (!container) return;

    // Store data for re-sort
    lastMatchesData = matches;
    lastMatchesHeroMap = heroMap;

    if (!matches || matches.length === 0) {
        showEmpty(containerId, '近期暂无加速模式比赛记录');
        return;
    }

    // Sort matches
    const sorted = sortMatches([...matches], matchTableSort, heroMap);

    // Count wins and losses
    let wins = 0, losses = 0;
    for (const m of matches) {
        if ((m.player_slot < 128) === m.radiant_win) wins++;
        else losses++;
    }

    const sortIndicator = (key) => {
        if (matchTableSort.field !== key) return '';
        return matchTableSort.asc ? ' ▲' : ' ▼';
    };

    const columns = [
        { key: 'time', label: '时间', sortable: true },
        { key: 'hero', label: '英雄', sortable: true },
        { key: 'result', label: '结果', sortable: true },
        { key: 'k', label: 'K', sortable: true },
        { key: 'd', label: 'D', sortable: true },
        { key: 'a', label: 'A', sortable: true },
        { key: 'kda', label: 'KDA', sortable: true },
        { key: 'gpm', label: 'GPM', sortable: true },
        { key: 'xpm', label: 'XPM', sortable: true },
        { key: 'duration', label: '时长', sortable: true },
        { key: 'link', label: '比赛', sortable: false },
    ];

    container.innerHTML = `
        <div class="matches-table-wrapper">
            <table class="data-table matches-table">
                <thead>
                    <tr>
                        ${columns.map(c => `
                            <th class="${c.sortable ? 'sortable' : ''} col-${c.key}"
                                ${c.sortable ? `data-sort="${c.key}"` : ''}>
                                ${c.label}${sortIndicator(c.key)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(m => renderMatchRow(m, heroMap)).join('')}
                </tbody>
            </table>
        </div>
        <div class="match-count">
            共 ${matches.length} 场比赛 —
            <span class="match-wl win">${wins} 胜</span>
            <span class="match-wl-sep">/</span>
            <span class="match-wl loss">${losses} 负</span>
        </div>
    `;

    // Attach sort handlers
    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (matchTableSort.field === field) {
                matchTableSort.asc = !matchTableSort.asc;
            } else {
                matchTableSort.field = field;
                matchTableSort.asc = false;
            }
            if (lastMatchesData) renderRecentMatches(containerId, lastMatchesData, lastMatchesHeroMap);
        });
    });
}

/** Sort matches by the given field */
function sortMatches(matches, sort, heroMap) {
    const { field, asc } = sort;
    const mul = asc ? 1 : -1;
    return matches.sort((a, b) => {
        let va, vb;
        switch (field) {
            case 'time':
                va = a.start_time; vb = b.start_time;
                break;
            case 'hero': {
                const ha = heroMap?.get(a.hero_id)?.localized_name || '';
                const hb = heroMap?.get(b.hero_id)?.localized_name || '';
                return mul * ha.localeCompare(hb, 'zh');
            }
            case 'result':
                va = ((a.player_slot < 128) === a.radiant_win) ? 1 : 0;
                vb = ((b.player_slot < 128) === b.radiant_win) ? 1 : 0;
                break;
            case 'k':
                va = a.kills || 0; vb = b.kills || 0;
                break;
            case 'd':
                va = a.deaths || 0; vb = b.deaths || 0;
                break;
            case 'a':
                va = a.assists || 0; vb = b.assists || 0;
                break;
            case 'kda':
                va = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : (a.kills + a.assists);
                vb = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : (b.kills + b.assists);
                break;
            case 'gpm':
                va = a.gold_per_min || 0; vb = b.gold_per_min || 0;
                break;
            case 'xpm':
                va = a.xp_per_min || 0; vb = b.xp_per_min || 0;
                break;
            case 'duration':
                va = a.duration || 0; vb = b.duration || 0;
                break;
            default:
                return 0;
        }
        return mul * (va - vb);
    });
}

function renderMatchRow(match, heroMap) {
    const heroName = heroMap.get(match.hero_id);
    const name = heroName ? heroName.localized_name : `Hero ${match.hero_id}`;
    const iconUrl = heroName
        ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroName.name}.png`
        : '';

    const isWin = (match.player_slot < 128) === match.radiant_win;
    const resultClass = isWin ? 'match-win' : 'match-loss';
    const resultText = isWin ? '胜' : '负';

    const kda = match.deaths > 0
        ? ((match.kills + match.assists) / match.deaths).toFixed(1)
        : (match.kills + match.assists).toFixed(1);

    const date = new Date(match.start_time * 1000);
    const now = new Date();
    const timeStr = formatRelativeTime(date, now);

    const duration = formatDuration(match.duration);

    const matchUrl = `https://www.opendota.com/matches/${match.match_id}`;
    // Also create a dotabuff URL (but may not work for turbo matches)
    const dotabuffUrl = `https://www.dotabuff.com/matches/${match.match_id}`;

    return `
        <tr class="match-row ${resultClass}" data-match-id="${match.match_id}">
            <td class="col-time" title="${date.toLocaleString('zh-CN')}">${timeStr}</td>
            <td class="col-hero">
                <div class="hero-cell">
                    ${iconUrl ? `<img src="${iconUrl}" alt="${name}" class="hero-icon-sm" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="hero-icon-fallback">${escapeHtml(name[0])}</span>` : `<span class="hero-icon-fallback">${escapeHtml(name[0])}</span>`}
                    <span>${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="col-result"><span class="result-badge ${isWin ? 'badge-win' : 'badge-loss'}">${resultText}</span></td>
            <td class="col-k">${match.kills}</td>
            <td class="col-d">${match.deaths}</td>
            <td class="col-a">${match.assists}</td>
            <td class="col-kda">${kda}</td>
            <td class="col-gpm">${match.gold_per_min}</td>
            <td class="col-xpm">${match.xp_per_min}</td>
            <td class="col-duration">${duration}</td>
            <td class="col-link">
                <a href="${matchUrl}" target="_blank" rel="noopener" title="OpenDota">OD</a>
                <a href="${dotabuffUrl}" target="_blank" rel="noopener" title="Dotabuff" class="db-link">DB</a>
            </td>
        </tr>
    `;
}

// --- Recent Peers Table (last 90 days) ---

/**
 * Render the recent peers table.
 * @param {string} containerId
 * @param {Array} peers - Array of peer objects from /peers API
 */
export function renderPeersTable(containerId, peers) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Store data for re-sort
    lastPeersData = peers;

    if (!peers || peers.length === 0) {
        const section = document.getElementById('peers-section');
        if (section) section.style.display = 'none';
        return;
    }

    const section = document.getElementById('peers-section');
    if (section) section.style.display = '';

    // Sort peers
    const sorted = sortPeers([...peers], peersTableSort);

    const sortIndicator = (key) => {
        if (peersTableSort.field !== key) return '';
        return peersTableSort.asc ? ' ▲' : ' ▼';
    };

    const columns = [
        { key: 'peer-name', label: '玩家', sortable: true },
        { key: 'tag', label: '标签', sortable: false },
        { key: 'games', label: '总场次', sortable: true },
        { key: 'with-games', label: '队友场次', sortable: true },
        { key: 'with-wr', label: '队友胜率', sortable: true },
        { key: 'against-games', label: '对手场次', sortable: true },
        { key: 'against-wr', label: '对手胜率', sortable: true },
        { key: 'time', label: '最后同场', sortable: true },
    ];

    container.innerHTML = `
        <div class="peers-table-wrapper">
            <table class="data-table peers-table">
                <thead>
                    <tr>
                        ${columns.map(c => `
                            <th class="${c.sortable ? 'sortable' : ''} col-${c.key}"
                                ${c.sortable ? `data-sort="${c.key}"` : ''}>
                                ${c.label}${sortIndicator(c.key)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(p => renderPeerRow(p)).join('')}
                </tbody>
            </table>
        </div>
        <div class="peers-count">共 ${peers.length} 位玩家</div>
    `;

    // Attach sort handlers
    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            e.stopPropagation();
            const field = th.dataset.sort;
            if (peersTableSort.field === field) {
                peersTableSort.asc = !peersTableSort.asc;
            } else {
                peersTableSort.field = field;
                peersTableSort.asc = false;
            }
            if (lastPeersData) renderPeersTable(containerId, lastPeersData);
        });
    });

    // Click to navigate to peer's analysis
    const rows = container.querySelectorAll('.peer-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const aid = row.dataset.accountId;
            if (aid) {
                document.getElementById('search-input').value = aid;
                document.getElementById('search-form')?.dispatchEvent(new Event('submit'));
            }
        });
    });
}

/** Sort peers by the given field */
function sortPeers(peers, sort) {
    const { field, asc } = sort;
    const mul = asc ? 1 : -1;
    return peers.sort((a, b) => {
        let va, vb;
        switch (field) {
            case 'peer-name':
                va = a.personaname || `玩家${a.account_id}`;
                vb = b.personaname || `玩家${b.account_id}`;
                return mul * va.localeCompare(vb, 'zh');
            case 'games':
                va = a.games || 0; vb = b.games || 0;
                break;
            case 'with-games':
                va = a.with_games || 0; vb = b.with_games || 0;
                break;
            case 'with-wr':
                va = a.with_games > 0 ? (a.with_win || 0) / a.with_games : -1;
                vb = b.with_games > 0 ? (b.with_win || 0) / b.with_games : -1;
                break;
            case 'against-games':
                va = a.against_games || 0; vb = b.against_games || 0;
                break;
            case 'against-wr':
                va = a.against_games > 0 ? (a.against_win || 0) / a.against_games : -1;
                vb = b.against_games > 0 ? (b.against_win || 0) / b.against_games : -1;
                break;
            case 'time':
                va = a.last_played || 0; vb = b.last_played || 0;
                break;
            default:
                return 0;
        }
        return mul * (va - vb);
    });
}

function renderPeerRow(peer) {
    const games = peer.games || 0;
    const withGames = peer.with_games || 0;
    const withWin = peer.with_win || 0;
    const againstGames = peer.against_games || 0;
    const againstWin = peer.against_win || 0;

    const withWR = withGames > 0 ? ((withWin / withGames) * 100).toFixed(1) : '-';
    const againstWR = againstGames > 0 ? ((againstWin / againstGames) * 100).toFixed(1) : '-';

    const withWRClass = withGames >= 3
        ? (parseFloat(withWR) >= 60 ? 'wr-good' : parseFloat(withWR) < 40 ? 'wr-bad' : 'wr-avg')
        : 'wr-avg';
    const againstWRClass = againstGames >= 3
        ? (parseFloat(againstWR) >= 60 ? 'wr-good' : parseFloat(againstWR) < 40 ? 'wr-bad' : 'wr-avg')
        : 'wr-avg';

    // Labels based on teammate and opponent win rates
    let label = '';
    const isBro = withGames >= 3 && parseFloat(withWR) >= 60;
    const isBeast = againstGames >= 3 && parseFloat(againstWR) >= 60;

    // When both "好基友" and "铁畜生" apply, it means this player is a lucky charm:
    // you win with them on your team AND you win against them on the enemy team.
    if (isBro && isBeast) {
        label += '<span class="peer-tag tag-lucky">🌟 真福星</span>';
    } else {
        if (isBro) label += '<span class="peer-tag tag-bro">🤝 好基友</span>';
        else if (withGames >= 3 && parseFloat(withWR) < 40) label += '<span class="peer-tag tag-pig">🐷 猪队友</span>';
        if (isBeast) label += '<span class="peer-tag tag-beast">🐶 铁畜生</span>';
        else if (againstGames >= 3 && parseFloat(againstWR) < 40) label += '<span class="peer-tag tag-nemesis">💀 真克星</span>';
    }

    const lastPlayed = peer.last_played
        ? formatRelativeTime(new Date(peer.last_played * 1000), new Date())
        : '未知';

    const name = peer.personaname || `玩家 ${peer.account_id}`;
    const avatar = peer.avatar || '';

    return `
        <tr class="peer-row" data-account-id="${escapeHtml(String(peer.account_id))}">
            <td class="col-peer-name">
                <div class="peer-cell">
                    ${avatar ? `<img src="${avatar}" alt="" class="peer-avatar" loading="lazy">` : '<span class="peer-avatar-fallback">?</span>'}
                    <span class="peer-name-text">${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="col-tag">${label || '<span class="peer-tag-empty">-</span>'}</td>
            <td class="col-games">${games}</td>
            <td class="col-with-games">${withGames}</td>
            <td class="col-with-wr ${withWRClass}">${withWR === '-' ? '-' : withWR + '%'}</td>
            <td class="col-against-games">${againstGames}</td>
            <td class="col-against-wr ${againstWRClass}">${againstWR === '-' ? '-' : againstWR + '%'}</td>
            <td class="col-time">${lastPlayed}</td>
        </tr>
    `;
}

// --- Rate Limit Indicator ---

export function renderRateLimitIndicator(containerId, status) {
    const container = $(containerId);
    if (!container) return;

    const minute = status?.minute;
    if (minute === null || minute === undefined) {
        container.innerHTML = '';
        return;
    }

    let cls = 'rate-ok';
    if (minute <= RATE_LIMIT.DANGER_THRESHOLD) cls = 'rate-danger';
    else if (minute <= RATE_LIMIT.WARN_THRESHOLD) cls = 'rate-warn';

    container.innerHTML = `
        <span class="rate-indicator ${cls}" title="每分钟剩余 API 请求次数">
            API: ${minute}/60
        </span>
    `;
}

// --- Player Not Found ---

export function showPlayerNotFound(containerId) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="state-error">
            <div class="state-icon">🔍</div>
            <p class="state-text">该玩家不存在，请检查 Steam32 ID 是否正确</p>
            <p class="state-hint">提示：在 Steam 个人资料页面，URL 中的数字即为 Steam ID<br>
            （如 steamcommunity.com/profiles/<b>76561199016484514</b>）<br>
            或使用 Dota 2 客户端内显示的 32 位好友 ID</p>
        </div>
    `;
}

// --- No Turbo Data ---

export function showNoTurboData(containerId, counts) {
    const container = $(containerId);
    if (!container) return;

    // Show what modes the player has played
    let modeList = '';
    if (counts?.game_mode) {
        const modeNames = {
            '1': '普通 All Pick', '2': '队长模式', '3': 'Random Draft',
            '4': 'Single Draft', '5': 'All Random', '22': 'All Draft',
            '23': '加速模式',
        };
        const items = Object.entries(counts.game_mode)
            .filter(([, v]) => v.games > 0)
            .map(([k, v]) => `<li>${modeNames[k] || '模式 ' + k}: ${v.games} 场 (胜率 ${(v.win/v.games*100).toFixed(1)}%)</li>`)
            .join('');
        modeList = `<ul class="mode-list">${items}</ul>`;
    }

    container.innerHTML = `
        <div class="state-empty">
            <div class="state-icon">🏎️</div>
            <p class="state-text">该玩家暂无加速模式（Turbo）比赛记录</p>
            <div class="state-sub">
                <p>已记录的游戏模式：</p>
                ${modeList || '<p>无数据</p>'}
            </div>
        </div>
    `;
}

// --- Network Error ---

export function showNetworkError(containerId, message, onRetry) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="state-error">
            <div class="state-icon">🌐</div>
            <p class="state-text">${escapeHtml(message || '网络连接失败')}</p>
            ${onRetry ? '<button class="btn btn-retry" id="retry-btn">重新连接</button>' : ''}
        </div>
    `;
    if (onRetry) {
        const btn = container.querySelector('#retry-btn');
        if (btn) btn.addEventListener('click', onRetry);
    }
}

// --- Error Summary (for dashboard-level errors) ---

export function showDashboardError(containerId, message, onRetry) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="state-error state-error-dashboard">
            <div class="state-icon">❌</div>
            <p class="state-text">${escapeHtml(message)}</p>
            ${onRetry ? '<button class="btn btn-retry" id="dashboard-retry">重试</button>' : ''}
        </div>
    `;
    if (onRetry) {
        const btn = container.querySelector('#dashboard-retry');
        if (btn) btn.addEventListener('click', onRetry);
    }
}

// --- Validation Error on Input ---

export function showInputError(inputId, message) {
    const input = $(inputId);
    if (!input) return;
    input.classList.add('input-error');

    // Find or create error message element
    let errorEl = input.parentElement.querySelector('.input-error-msg');
    if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.className = 'input-error-msg';
        input.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
}

export function clearInputError(inputId) {
    const input = $(inputId);
    if (!input) return;
    input.classList.remove('input-error');
    const errorEl = input.parentElement.querySelector('.input-error-msg');
    if (errorEl) errorEl.remove();
}

// --- Utility Functions ---

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function formatFullDate(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatRelativeTime(date, now) {
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay < 7) return `${diffDay}天前`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}周前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// --- Full Dashboard Render ---

/**
 * Render the complete dashboard with all sections populated.
 */
export function renderFullDashboard(profile, turboStats, heroMap, matches) {
    // Show dashboard
    showDashboard(true);

    // Player profile
    renderPlayerProfile('profile-section', profile);

    // Summary cards
    renderTurboSummary('summary-section', {
        totalGames: turboStats.totalGames,
        wins: turboStats.wins,
        losses: turboStats.losses,
        winRate: turboStats.winRate,
        avgKills: turboStats.avgKills,
        avgDeaths: turboStats.avgDeaths,
        avgAssists: turboStats.avgAssists,
        avgGpm: turboStats.avgGpm,
        avgXpm: turboStats.avgXpm,
        maxStreak: turboStats.maxStreak,
        radiantWR: turboStats.radiantWR || 0,
        direWR: turboStats.direWR || 0,
        coreGames: turboStats.coreGames || 0,
        supportGames: turboStats.supportGames || 0,
        computedMmrTurbo: turboStats.computedMmrTurbo ?? null,
    });

    // Hero table
    renderHeroTable('hero-table-section', turboStats.heroes || [], heroMap, null);

    // Recent matches
    renderRecentMatches('matches-section', matches, heroMap);

    // Show chart sections
    const chartSection = document.getElementById('charts-section');
    if (chartSection) chartSection.style.display = '';
}

export function clearDashboard() {
    showDashboard(false);
    ['profile-section', 'session-advice-section', 'sleep-section', 'summary-section', 'patch-selector-section', 'hero-table-section', 'matches-section', 'peers-table-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    const chartSection = document.getElementById('charts-section');
    if (chartSection) chartSection.style.display = 'none';
    const peersSection = document.getElementById('peers-section');
    if (peersSection) peersSection.style.display = 'none';
}

/**
 * Render the chart canvases after the dashboard is populated.
 * This is called separately because charts need the canvas elements to exist in the DOM.
 */
export function renderChartCanvases() {
    const chartsSection = document.getElementById('charts-section');
    if (!chartsSection) return;

    chartsSection.innerHTML = `
        <div class="chart-grid">
            <div class="chart-card">
                <h3 class="chart-title">胜率趋势</h3>
                <div class="chart-container">
                    <canvas id="winrate-trend-chart"></canvas>
                </div>
            </div>
            <div class="chart-card">
                <h3 class="chart-title">英雄表现</h3>
                <div class="chart-container">
                    <canvas id="hero-perf-chart"></canvas>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Player List Sidebar
// ============================================================

export let isEnemyView = false;

export function setEnemyHighlight(enabled) {
    isEnemyView = enabled;
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        if (enabled) {
            dashboard.classList.add('enemy-view');
            dashboard.classList.remove('teammate-view');
        } else {
            dashboard.classList.remove('enemy-view');
        }
    }
}

export function setTeammateHighlight(enabled) {
    isEnemyView = false;
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        if (enabled) {
            dashboard.classList.add('teammate-view');
            dashboard.classList.remove('enemy-view');
        } else {
            dashboard.classList.remove('teammate-view');
        }
    }
}

/**
 * Render the player list panel.
 * @param {string} containerId
 * @param {object} playerList - { myId, enemyIds }
 * @param {object} callbacks - { onSelectMy, onSelectEnemy, onSetMy, onAddEnemy, onRemoveEnemy, onRefresh }
 */
export function renderPlayerList(containerId, playerList, callbacks) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { myId, enemyIds, teammateIds = [] } = playerList;

    // Preserve collapse state
    const wasMyOpen = document.getElementById('collapse-my')?.classList.contains('open');
    const wasTeammateOpen = document.getElementById('collapse-teammate')?.classList.contains('open');
    const wasEnemyOpen = document.getElementById('collapse-enemy')?.classList.contains('open');

    container.innerHTML = `
        <div class="player-list-panel">
            <!-- 本人 Section -->
            <div class="player-list-section">
                <div class="player-list-label collapsible-header" data-action="toggle-collapse" data-target="collapse-my">
                    <span class="collapse-arrow ${wasMyOpen !== false ? 'open' : ''}" data-target="collapse-my">▾</span>
                    👤 本人
                </div>
                <div class="collapsible-body ${wasMyOpen !== false ? 'open' : ''}" id="collapse-my">
                    ${myId ? `
                        <div class="player-item my-player" data-action="select-my">
                            <span class="player-item-id">${escapeHtml(myId)}</span>
                            <span class="player-item-badge me">我</span>
                        </div>
                    ` : `
                        <div class="player-item no-player">
                            <span class="player-item-hint">尚未设置</span>
                        </div>
                    `}
                    <div class="player-id-input-row">
                        <input type="text" class="player-id-input" id="my-id-input"
                            placeholder="输入 Steam32 ID"
                            inputmode="numeric" autocomplete="off"
                            value="${escapeHtml(myId || '')}">
                        <button class="btn btn-sm btn-set-my" data-action="set-my">设为本人</button>
                    </div>
                </div>
            </div>

            <!-- 队友 Section -->
            <div class="player-list-section">
                <div class="player-list-label collapsible-header" data-action="toggle-collapse" data-target="collapse-teammate">
                    <span class="collapse-arrow ${wasTeammateOpen !== false ? 'open' : ''}" data-target="collapse-teammate">▾</span>
                    🤝 我的队友
                </div>
                <div class="collapsible-body ${wasTeammateOpen !== false ? 'open' : ''}" id="collapse-teammate">
                    ${teammateIds.length > 0 ? `
                        <div class="teammate-list">
                            ${teammateIds.map(e => `
                                <div class="player-item teammate-item" data-player-id="${escapeHtml(e.id)}">
                                    <span class="player-item-display" data-action="select-teammate">${escapeHtml(e.note || e.id)}</span>
                                    <button class="btn-remove-teammate" data-action="remove-teammate" data-player-id="${escapeHtml(e.id)}" title="移除">✕</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="player-item no-player">
                            <span class="player-item-hint">还没有队友</span>
                        </div>
                    `}
                    <div class="player-id-input-row">
                        <input type="text" class="player-id-input" id="teammate-id-input"
                            placeholder="队友 Steam32 ID"
                            inputmode="numeric" autocomplete="off">
                        <input type="text" class="player-id-input note-input" id="teammate-note-input"
                            placeholder="备注（可选）"
                            autocomplete="off" maxlength="20">
                        <button class="btn btn-sm btn-add-teammate-inline" data-action="add-teammate">添加</button>
                    </div>
                </div>
            </div>

            <!-- 仇人 Section -->
            <div class="player-list-section">
                <div class="player-list-label collapsible-header" data-action="toggle-collapse" data-target="collapse-enemy">
                    <span class="collapse-arrow ${wasEnemyOpen !== false ? 'open' : ''}" data-target="collapse-enemy">▾</span>
                    😈 仇人列表
                </div>
                <div class="collapsible-body ${wasEnemyOpen !== false ? 'open' : ''}" id="collapse-enemy">
                    ${enemyIds.length > 0 ? `
                        <div class="enemy-list">
                            ${enemyIds.map(e => `
                                <div class="player-item enemy-item" data-player-id="${escapeHtml(e.id)}">
                                    <span class="player-item-display" data-action="select-enemy">${escapeHtml(e.note || e.id)}</span>
                                    <button class="btn-remove-enemy" data-action="remove-enemy" data-player-id="${escapeHtml(e.id)}" title="移除">✕</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="player-item no-player">
                            <span class="player-item-hint">还没有仇人</span>
                        </div>
                    `}
                    <div class="player-id-input-row">
                        <input type="text" class="player-id-input" id="enemy-id-input"
                            placeholder="仇人 Steam32 ID"
                            inputmode="numeric" autocomplete="off">
                        <input type="text" class="player-id-input note-input" id="enemy-note-input"
                            placeholder="备注（可选）"
                            autocomplete="off" maxlength="20">
                        <button class="btn btn-sm btn-add-enemy-inline" data-action="add-enemy">添加</button>
                    </div>
                </div>
            </div>

            <!-- 高级功能 Section -->
            <div class="player-list-section">
                <div class="player-list-label collapsible-header" data-action="toggle-collapse" data-target="collapse-advanced">
                    <span class="collapse-arrow open" data-target="collapse-advanced">▾</span>
                    ⚡ 高级功能
                </div>
                <div class="collapsible-body open" id="collapse-advanced">
                    <div class="advanced-buttons">
                        <button class="btn btn-sm btn-advanced" data-action="open-leaderboard">🌟 琅琊榜</button>
                        <button class="btn btn-sm btn-advanced" data-action="open-pros">👑 与神同行</button>
                    </div>
                </div>
            </div>

            <div class="player-list-actions">
                <button class="btn btn-sm btn-refresh" data-action="refresh">🔄 刷新</button>
            </div>
        </div>
    `;

    // Event delegation
    container.addEventListener('click', (e) => {
        const target = e.target;
        const action = target.dataset.action;
        if (!action) return;

        // Toggle collapse
        if (action === 'toggle-collapse') {
            const bodyId = target.dataset.target || target.closest('[data-target]')?.dataset?.target;
            if (bodyId) {
                const body = document.getElementById(bodyId);
                const arrows = container.querySelectorAll(`[data-target="${bodyId}"]`);
                if (body) {
                    body.classList.toggle('open');
                    arrows.forEach(a => a.classList.toggle('open'));
                }
            }
        }

        // Select my player
        if (action === 'select-my' && myId && callbacks.onSelectMy) {
            callbacks.onSelectMy();
        }

        // Set my ID from input
        if (action === 'set-my') {
            const input = document.getElementById('my-id-input');
            const id = input?.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onSetMy) {
                callbacks.onSetMy(id);
            }
        }

        // Select teammate
        if (action === 'select-teammate') {
            const pid = target.closest('.teammate-item')?.dataset.playerId;
            if (pid && callbacks.onSelectTeammate) callbacks.onSelectTeammate(pid);
        }

        // Remove teammate
        if (action === 'remove-teammate') {
            e.stopPropagation();
            const pid = target.dataset.playerId;
            if (pid && callbacks.onRemoveTeammate) callbacks.onRemoveTeammate(pid);
        }

        // Add teammate from inputs
        if (action === 'add-teammate') {
            const idInput = document.getElementById('teammate-id-input');
            const noteInput = document.getElementById('teammate-note-input');
            const id = idInput?.value.trim();
            const note = noteInput?.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onAddTeammate) {
                callbacks.onAddTeammate(id, note || '');
                if (idInput) idInput.value = '';
                if (noteInput) noteInput.value = '';
            }
        }

        // Select enemy
        if (action === 'select-enemy') {
            const pid = target.closest('.enemy-item')?.dataset.playerId;
            if (pid && callbacks.onSelectEnemy) callbacks.onSelectEnemy(pid);
        }

        // Remove enemy
        if (action === 'remove-enemy') {
            e.stopPropagation();
            const pid = target.dataset.playerId;
            if (pid && callbacks.onRemoveEnemy) callbacks.onRemoveEnemy(pid);
        }

        // Add enemy from inputs
        if (action === 'add-enemy') {
            const idInput = document.getElementById('enemy-id-input');
            const noteInput = document.getElementById('enemy-note-input');
            const id = idInput?.value.trim();
            const note = noteInput?.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onAddEnemy) {
                callbacks.onAddEnemy(id, note || '');
                if (idInput) idInput.value = '';
                if (noteInput) noteInput.value = '';
            }
        }

        // Refresh
        if (action === 'refresh' && callbacks.onRefresh) {
            callbacks.onRefresh();
        }

        // Advanced features
        if (action === 'open-leaderboard' && callbacks.onOpenLeaderboard) {
            callbacks.onOpenLeaderboard();
        }
        if (action === 'open-pros' && callbacks.onOpenPros) {
            callbacks.onOpenPros();
        }
    });

    // Enter key support
    document.getElementById('my-id-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const id = e.target.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onSetMy) {
                callbacks.onSetMy(id);
            }
        }
    });
    document.getElementById('teammate-id-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const idInput = document.getElementById('teammate-id-input');
            const noteInput = document.getElementById('teammate-note-input');
            const id = idInput?.value.trim();
            const note = noteInput?.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onAddTeammate) {
                callbacks.onAddTeammate(id, note || '');
                if (idInput) idInput.value = '';
                if (noteInput) noteInput.value = '';
            }
        }
    });
    document.getElementById('enemy-id-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const idInput = document.getElementById('enemy-id-input');
            const noteInput = document.getElementById('enemy-note-input');
            const id = idInput?.value.trim();
            const note = noteInput?.value.trim();
            if (id && /^\d+$/.test(id) && callbacks.onAddEnemy) {
                callbacks.onAddEnemy(id, note || '');
                if (idInput) idInput.value = '';
                if (noteInput) noteInput.value = '';
            }
        }
    });
}

// ============================================================
// Sleep Evaluation Card
// ============================================================

import { getSleepColor, getSleepEmoji, getSleepLabel } from './sleep.js';

/**
 * Render the sleep evaluation card.
 * @param {string} containerId
 * @param {object} evalResult - From evaluateSleep()
 * @param {string} message - Sleep evaluation message
 * @param {boolean} isEnemy - Whether viewing an enemy
 */
export function renderSleepCard(containerId, evalResult, message, isEnemy, isTeammate = false) {
    const container = document.getElementById(containerId);
    if (!container || !evalResult) return;

    const { score, quality, lastMatch, matchCount, timeStr, isWin, kda } = evalResult;
    const color = getSleepColor(quality);
    const emoji = getSleepEmoji(quality);
    const label = getSleepLabel(quality);
    let cardClass = 'sleep-card-self';
    if (isTeammate) cardClass = 'sleep-card-teammate';
    else if (isEnemy) cardClass = 'sleep-card-enemy';

    // Score ring: SVG circle
    const circumference = 2 * Math.PI * 45;
    const dashOffset = circumference - (score / 100) * circumference;

    let titleText = '你的睡眠评估';
    if (isTeammate) titleText = '队友睡眠评估';
    else if (isEnemy) titleText = '仇人睡眠评估';

    container.innerHTML = `
        <div class="sleep-card ${cardClass}">
            <div class="sleep-header">
                <span class="sleep-icon">${emoji}</span>
                <h3 class="sleep-title">${titleText}</h3>
            </div>

            <div class="sleep-body">
                <div class="sleep-score-ring">
                    <svg viewBox="0 0 120 120" class="sleep-ring-svg">
                        <circle cx="60" cy="60" r="45" class="sleep-ring-bg" />
                        <circle cx="60" cy="60" r="45"
                            class="sleep-ring-fg"
                            stroke="${color}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${dashOffset}"
                            transform="rotate(-90 60 60)" />
                    </svg>
                    <div class="sleep-score-text">
                        <span class="sleep-score-num" style="color:${color}">${score}</span>
                        <span class="sleep-score-label">${label}</span>
                    </div>
                </div>

                <div class="sleep-message" style="border-left-color:${color}">
                    <p>${escapeHtml(message)}</p>
                </div>
            </div>

            ${lastMatch ? `
            <div class="sleep-details">
                <div class="sleep-detail-item">
                    <span class="detail-label">最后一局时间</span>
                    <span class="detail-value">${timeStr}</span>
                </div>
                <div class="sleep-detail-item">
                    <span class="detail-label">结果</span>
                    <span class="detail-value ${isWin ? 'win' : 'loss'}">${isWin ? '胜利 ✅' : '失败 ❌'}</span>
                </div>
                <div class="sleep-detail-item">
                    <span class="detail-label">KDA</span>
                    <span class="detail-value">${kda}</span>
                </div>
                <div class="sleep-detail-item">
                    <span class="detail-label">时段总局数</span>
                    <span class="detail-value">${matchCount} 场</span>
                </div>
            </div>
            ` : `
            <div class="sleep-details">
                <div class="sleep-detail-item">
                    <span class="detail-label">时段总局数</span>
                    <span class="detail-value">0 场</span>
                </div>
            </div>
            `}
        </div>
    `;
}

// ============================================================
// Teammate Inactive Card (队友超过1年未游戏)
// ============================================================

/**
 * Render a special card when a teammate hasn't played in over a year.
 * @param {string} containerId
 */
export function renderTeammateInactiveCard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="sleep-card sleep-card-teammate sleep-card-inactive">
            <div class="sleep-header">
                <span class="sleep-icon">🕊️</span>
                <h3 class="sleep-title">队友睡眠评估</h3>
            </div>

            <div class="sleep-body sleep-body-inactive">
                <div class="inactive-message">
                    <p class="inactive-text">你快回来，我一个人承受不来</p>
                    <p class="inactive-sub">这位队友已经超过一年没有上线了...</p>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Current Session Advice Banner (real-time during 20:00-02:00)
// ============================================================

/**
 * Render a prominent real-time advice banner for players currently in the sleep window.
 * @param {string} containerId
 * @param {object} advice - From getCurrentSessionAdvice()
 * @param {boolean} isEnemy
 */
export function renderSessionAdvice(containerId, advice, isEnemy, isTeammate = false) {
    const container = document.getElementById(containerId);
    if (!container || !advice) return;

    const { emoji, message, isWin, matchCount } = advice;

    // Different styling based on tone
    let toneClass = 'advice-win';
    if (isTeammate) toneClass = 'advice-teammate';
    else if (isEnemy) toneClass = 'advice-enemy';
    else if (!isWin) toneClass = 'advice-loss';

    container.innerHTML = `
        <div class="session-advice ${toneClass}">
            <div class="advice-emoji">${emoji}</div>
            <div class="advice-content">
                <div class="advice-label">⏰ 实时提醒</div>
                <p class="advice-message">${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}


// ============================================================
// Patch Version Filter
// ============================================================

export function renderPatchSelector(containerId, patches, selected, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="patch-selector">
            <span class="patch-label">📦 版本筛选</span>
            <select class="patch-select" id="patch-select">
                <option value="">全部版本</option>
                ${patches.map(p => {
                    const ver = PATCH_VERSIONS[p];
                    const label = ver ? `${ver} (Patch ${p})` : `Patch ${p}`;
                    return '<option value="' + p + '" ' + (selected === p ? 'selected' : '') + '>' + label + '</option>';
                }).join('')}
            </select>
        </div>
    `;

    document.getElementById('patch-select')?.addEventListener('change', (e) => {
        const val = e.target.value;
        onChange(val ? parseInt(val) : null);
    });
}

// ============================================================
// Modal Utilities
// ============================================================

/**
 * Close and remove the modal.
 */
export function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.remove();
}

/**
 * Show a loading spinner in the modal.
 */
export function showModalLoading() {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-card modal-loading-card">
                <div class="modal-body" style="text-align:center;padding:48px;">
                    <div class="spinner"></div>
                    <p class="state-text" style="margin-top:16px;">别只关心赢的多不多，重要是睡的好不好</p>
                </div>
            </div>
        </div>
    `;
    bindModalEvents(container);
}

/**
 * Show a simple alert-style modal with a message.
 * @param {string} message
 */
export function showModalAlert(message) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-card modal-alert">
                <div class="modal-header">
                    <span class="modal-title">提示</span>
                    <button class="modal-close" data-action="close-modal">✕</button>
                </div>
                <div class="modal-body">
                    <p class="modal-alert-text">${escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-sm" data-action="close-modal">确定</button>
                </div>
            </div>
        </div>
    `;
    bindModalEvents(container);
}

/**
 * Render the leaderboard modal (琅琊榜).
 * @param {string} containerId - The modal container ID
 * @param {Array} players - Array of top player objects
 */
export function renderLeaderboardModal(players) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    if (!players || players.length === 0) {
        showModalAlert('暂无加速模式排行榜数据');
        return;
    }

    const nowSec = Date.now() / 1000;
    const thirtyDays = 30 * 24 * 60 * 60;

    // Helper: normalize last_match_time to Unix timestamp (seconds).
    // OpenDota can return ISO string or numeric timestamp.
    const toTimestamp = (val) => {
        if (val == null) return 0;
        if (typeof val === 'number') return val;
        // ISO string like "2026-06-07T17:43:04.000Z"
        const t = new Date(val).getTime() / 1000;
        return isNaN(t) ? 0 : t;
    };

    // Filter: only players active in last 30 days, take top 30
    const active = players
        .filter(p => {
            const ts = toTimestamp(p.last_match_time);
            return ts > 0 && (nowSec - ts) < thirtyDays;
        })
        .slice(0, 30);

    if (active.length === 0) {
        showModalAlert('最近30天内暂无活跃的加速模式高排名玩家');
        return;
    }

    const rows = active.map((p, i) => {
        const avatar = p.avatar || p.avatarmedium || '';
        const name = escapeHtml(p.personaname || p.name || `玩家 ${p.account_id}`);
        const mmrVal = p.computed_mmr ?? p.mmr_estimate ?? p.computed_mmr_turbo ?? null;
        const mmr = mmrVal != null ? Math.round(mmrVal).toLocaleString() : '-';
        const ts = toTimestamp(p.last_match_time);
        const lastMatch = ts > 0
            ? formatRelativeTime(new Date(ts * 1000), new Date())
            : '未知';

        return `
            <tr class="leaderboard-row">
                <td class="col-rank">${i + 1}</td>
                <td class="col-player">
                    <div class="leaderboard-player">
                        ${avatar ? `<img src="${avatar}" alt="" class="leaderboard-avatar" loading="lazy">` : '<span class="leaderboard-avatar-fallback">?</span>'}
                        <span class="leaderboard-name">${name}</span>
                    </div>
                </td>
                <td class="col-mmr">${mmr}</td>
                <td class="col-last-match">${lastMatch}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-card modal-leaderboard">
                <div class="modal-header">
                    <span class="modal-title">🌟 琅琊榜 — 加速模式高手</span>
                    <button class="modal-close" data-action="close-modal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="modal-table-wrapper">
                        <table class="data-table leaderboard-table">
                            <thead>
                                <tr>
                                    <th class="col-rank">#</th>
                                    <th class="col-player">玩家</th>
                                    <th class="col-mmr">隐藏分</th>
                                    <th class="col-last-match">最后游戏</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-count">共 ${active.length} 名玩家（近30天活跃）</div>
                </div>
            </div>
        </div>
    `;
    bindModalEvents(container);
}

/**
 * Render the pros modal (与神同行).
 * @param {Array} pros - Array of pro player objects
 */
export function renderProsModal(pros) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    if (!pros || pros.length === 0) {
        showModalAlert('暂无与职业选手同排的记录');
        return;
    }

    // Helper: normalize last_match_time to Unix timestamp (seconds)
    const toTimestamp = (val) => {
        if (val == null) return 0;
        if (typeof val === 'number') return val;
        const t = new Date(val).getTime() / 1000;
        return isNaN(t) ? 0 : t;
    };

    const rows = pros.map(p => {
        const avatar = p.avatar || p.avatarmedium || '';
        const personaname = escapeHtml(p.personaname || `选手 ${p.account_id}`);
        const proName = escapeHtml(p.name || '-');
        const teamName = escapeHtml(p.team_name || p.team_tag || '-');
        const lastPlayed = p.last_played || 0;
        const lastMatch = lastPlayed > 0
            ? formatFullDate(new Date(lastPlayed * 1000))
            : '未知';

        return `
            <tr class="pros-row">
                <td class="col-player">
                    <div class="leaderboard-player">
                        ${avatar ? `<img src="${avatar}" alt="" class="leaderboard-avatar" loading="lazy">` : '<span class="leaderboard-avatar-fallback">?</span>'}
                        <span class="leaderboard-name">${personaname}</span>
                    </div>
                </td>
                <td class="col-pro-name">${proName}</td>
                <td class="col-team">${teamName}</td>
                <td class="col-last-match">${lastMatch}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-card modal-pros">
                <div class="modal-header">
                    <span class="modal-title">👑 与神同行</span>
                    <button class="modal-close" data-action="close-modal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="modal-table-wrapper">
                        <table class="data-table pros-table">
                            <thead>
                                <tr>
                                    <th class="col-player">选手</th>
                                    <th class="col-pro-name">职业名</th>
                                    <th class="col-team">职业队</th>
                                    <th class="col-last-match">最后同场</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-count">共 ${pros.length} 位职业选手</div>
                </div>
            </div>
        </div>
    `;
    bindModalEvents(container);
}

/**
 * Bind close events to a freshly-rendered modal.
 */
function bindModalEvents(container) {
    const overlay = container.querySelector('#modal-overlay');
    if (!overlay) return;

    // Close on overlay click (outside the card)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // Close on close button click
    overlay.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
        btn.addEventListener('click', () => closeModal());
    });

    // Close on ESC key
    const onKey = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}
