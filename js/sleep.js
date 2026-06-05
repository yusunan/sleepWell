// ============================================================
// sleep.js — Sleep Quality Evaluation for "睡了么"
// ============================================================

const SLEEP_START_HOUR = 20;  // 20:00
const SLEEP_END_HOUR = 2;     // 02:00 (next day)

/**
 * Evaluate sleep quality based on recent matches.
 *
 * @param {Array} matches - Array of match objects (last 24 hours)
 * @param {Map} heroMap - Hero ID → name mapping
 * @returns {Object} Evaluation result
 */
export function evaluateSleep(matches, heroMap) {
    // Filter to matches in the sleep window (20:00 - 02:00) over last 24h
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sleepMatches = matches
        .filter(m => {
            const matchTime = new Date(m.start_time * 1000);
            if (matchTime < cutoff) return false;
            const hour = matchTime.getHours();
            return hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR;
        })
        .sort((a, b) => a.start_time - b.start_time); // chronological

    // No matches in sleep window → great sleep!
    if (sleepMatches.length === 0) {
        return {
            score: 100,
            timeScore: 100,
            winScore: 100,
            kdaScore: 100,
            quality: 'excellent',
            lastMatch: null,
            matchCount: 0,
            message: '',
        };
    }

    // Use the LAST match in the sleep window for evaluation
    const lastMatch = sleepMatches[sleepMatches.length - 1];
    const lastMatchTime = new Date(lastMatch.start_time * 1000);
    const lastMatchHour = lastMatchTime.getHours();
    const lastMatchMin = lastMatchTime.getMinutes();

    // --- Time Score (0-100) ---
    // Earlier in window = better score
    // 20:00 = 100, 02:00 = 0
    let timeScore;
    if (lastMatchHour >= SLEEP_START_HOUR) {
        // 20:00 - 23:59
        const hoursPast = lastMatchHour - SLEEP_START_HOUR + lastMatchMin / 60;
        timeScore = Math.max(0, 100 - hoursPast * 16.7); // 100 at 20:00, ~33 at 00:00
    } else {
        // 00:00 - 01:59
        const hoursPast = lastMatchHour + lastMatchMin / 60;
        timeScore = Math.max(0, 33 - hoursPast * 16.5); // ~33 at 00:00, 0 at 02:00
    }

    // --- Win Score (0-100) ---
    const isWin = (lastMatch.player_slot < 128) === lastMatch.radiant_win;
    const winScore = isWin ? 100 : 0;

    // --- KDA Score (0-100) ---
    const kda = lastMatch.deaths > 0
        ? (lastMatch.kills + lastMatch.assists) / lastMatch.deaths
        : (lastMatch.kills + lastMatch.assists);
    // High KDA → excited, harder to sleep (inverted U)
    // Good KDA (2-5): best for sleep → 100
    // Very low KDA (<1): tilted → 30
    // Very high KDA (>10): too excited → 50
    let kdaScore;
    if (kda < 1) {
        kdaScore = 30;
    } else if (kda <= 5) {
        kdaScore = 70 + (kda - 1) * 7.5; // 70 at KDA=1, 100 at KDA=5
    } else {
        kdaScore = Math.max(50, 100 - (kda - 5) * 10); // 100 at KDA=5, 50 at KDA=10+
    }
    kdaScore = Math.round(kdaScore);

    // --- Overall Score ---
    // Weight: time 50%, win 25%, KDA 25%
    const score = Math.round(timeScore * 0.5 + winScore * 0.25 + kdaScore * 0.25);

    // --- Quality ---
    let quality;
    if (score >= 80) quality = 'excellent';
    else if (score >= 60) quality = 'good';
    else if (score >= 40) quality = 'poor';
    else quality = 'terrible';

    return {
        score,
        timeScore: Math.round(timeScore),
        winScore,
        kdaScore,
        quality,
        lastMatch,
        matchCount: sleepMatches.length,
        timeStr: `${String(lastMatchHour).padStart(2, '0')}:${String(lastMatchMin).padStart(2, '0')}`,
        isWin,
        kda: parseFloat(kda.toFixed(1)),
    };
}

// --- Message Templates ---

const GENTLE_MESSAGES = {
    excellent: [
        '昨晚早早收工，今天一定精神饱满！ 🌞',
        '看来昨晚休息得很好！ ✨',
        '昨晚的表现满分！💯',
    ],
    good: [
        '睡的多赢得多，睡的少赢的少 🌙',
        '还不错，但别让游戏偷走睡眠😴',
    ],
    poor: [
        '下次早一点睡就更好了 💤',
        '权威数据表明睡眠质量与胜率相关 🥺',
        '马马虎虎，今晚争取再早半小时收工吧 🌙',
    ],
    terrible: [
        '鏖战到天亮，好像你年轻那样',
        '输了游戏你还有人生',
    ],
};

const CRITICAL_MESSAGES = {
    excellent: [
        '啧，睡得还挺早，可惜睡得早不代表打得好 😏',
        '早睡有什么用，水平还是那么菜 🥱',
        '哦，也就只会早睡这一招了，战绩还是那么感人',
    ],
    good: [
        '还行吧，但这水平也就这样了，睡多睡少没区别 🤷',
        '睡眠质量还行，游戏质量就...呵呵',
        '马马虎虎的睡眠，配马马虎虎的技术，挺搭的',
    ],
    poor: [
        '又菜又爱熬夜，难怪战绩上不去 🤡',
        '熬夜打Dota还打成这样，建议换个游戏吧',
        '睡这么晚，操作能好就怪了！早睡说不定还能少送几个人头',
    ],
    terrible: [
        '凌晨还在送人头，简直是用生命在掉分！建议卸载保平安 🔪',
        '通宵打游戏还这么菜，你这水平对得起你的黑眼圈吗？',
        '天都快亮了还在打，而且打得还这么烂...没救了 🤦',
    ],
};

const NO_GAME_GENTLE = [
    '昨晚没打游戏，睡得超级好！精神满满的你，今天无敌！🌟',
    '昨晚挂机休息，今天状态拉满！这才是正确的打开方式 ✨',
];

const NO_GAME_CRITICAL = [
    '昨晚居然没打？是不是被虐怕了不敢上线了 😂',
    '哦？昨天没玩？是不是上次输太惨心态崩了',
    '没打游戏的一天...那今天上线继续送吗？',
];

/**
 * Get a random message from an array.
 */
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate sleep evaluation message.
 *
 * @param {Object} evalResult - Result from evaluateSleep()
 * @param {boolean} isEnemy - Whether this is an enemy player
 * @param {Map} heroMap - Hero map for hero names
 * @returns {string} Evaluation message
 */
export function getSleepMessage(evalResult, isEnemy, heroMap) {
    const { quality, lastMatch, matchCount, timeStr, isWin, kda } = evalResult;
    const messages = isEnemy ? CRITICAL_MESSAGES : GENTLE_MESSAGES;

    // No games in sleep window
    if (matchCount === 0) {
        return pick(isEnemy ? NO_GAME_CRITICAL : NO_GAME_GENTLE);
    }

    // Build detailed message
    const heroName = lastMatch && heroMap
        ? (heroMap.get(lastMatch.hero_id)?.localized_name || `英雄${lastMatch.hero_id}`)
        : '英雄';

    let detail = '';
    if (isEnemy) {
        // Critical tone — include match details
        const winText = isWin ? '侥幸获胜' : '被人爆锤';
        detail = `最后一把${heroName}打到${timeStr}，${winText}，KDA ${kda}。`;
    } else {
        // Gentle tone — soft details
        const winText = isWin ? '直接拿下' : '遗憾惜败';
        detail = `昨晚最后一把${heroName}玩到${timeStr}，${winText}`;
        if (kda >= 5) detail += isWin ? '宰猪！这么兴奋会不会睡不着~' : ' 虽败犹荣！杀的爽也能睡的香~';
        else if (kda < 2) detail += isWin ? '躺了躺了！躺好了直接睡觉' : ' 摸摸头，今晚铁血复仇~';
    }

    return pick(messages[quality]) + ' ' + detail;
}

/**
 * Get emoji for sleep quality.
 */
export function getSleepEmoji(quality) {
    switch (quality) {
        case 'excellent': return '😴';
        case 'good': return '💤';
        case 'poor': return '🥱';
        case 'terrible': return '😈';
        default: return '🤔';
    }
}

/**
 * Get CSS color for sleep quality.
 */
export function getSleepColor(quality) {
    switch (quality) {
        case 'excellent': return '#4caf50';
        case 'good': return '#8bc34a';
        case 'poor': return '#ff9800';
        case 'terrible': return '#f44336';
        default: return '#9098a8';
    }
}

/**
 * Format sleep quality as Chinese label.
 */
export function getSleepLabel(quality) {
    switch (quality) {
        case 'excellent': return '睡得超好';
        case 'good': return '睡得还行';
        case 'poor': return '睡得不好';
        case 'terrible': return '严重缺觉';
        default: return '未知';
    }
}
