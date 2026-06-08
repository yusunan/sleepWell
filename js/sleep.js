// ============================================================
// sleep.js — Sleep Quality Evaluation for "睡了么"
// ============================================================

const SLEEP_START_HOUR = 20;  // 20:00
const SLEEP_END_HOUR = 2;     // 02:00 (next day)
const INACTIVE_DAYS = 365;    // Consider player inactive if no match in this many days

/**
 * Check if a player appears inactive (no matches in over INACTIVE_DAYS).
 * @param {Array} matches - Array of recent match objects
 * @returns {boolean}
 */
export function isPlayerInactive(matches) {
    if (!matches || matches.length === 0) return true;
    // Find the most recent match
    let latest = 0;
    for (const m of matches) {
        if (m.start_time > latest) latest = m.start_time;
    }
    if (latest === 0) return true;
    const daysSince = (Date.now() / 1000 - latest) / 86400;
    return daysSince > INACTIVE_DAYS;
}

/**
 * Evaluate sleep quality based on recent matches.
 *
 * @param {Array} matches - Array of match objects (last 24 hours)
 * @param {Map} heroMap - Hero ID → name mapping
 * @returns {Object} Evaluation result
 */
export function evaluateSleep(matches, heroMap) {
    const now = new Date();

    // Determine the LAST COMPLETED sleep window.
    // A sleep window always ends at 02:00. Find the most recent 02:00 that has passed.
    const last2am = new Date(now);
    last2am.setHours(2, 0, 0, 0);

    if (now < last2am) {
        // Before 02:00 today → the current window hasn't closed yet.
        // Use yesterday's 02:00 (the last completed window).
        last2am.setDate(last2am.getDate() - 1);
    }

    // Window start: 20:00 the day before last2am
    // e.g., last2am = Tue 02:00 → start = Mon 20:00
    const windowStart = new Date(last2am);
    windowStart.setDate(windowStart.getDate() - 1);
    windowStart.setHours(20, 0, 0, 0);

    console.log(`[sleep] 评估窗口: ${windowStart.toLocaleString()} → ${last2am.toLocaleString()}`);
    console.log(`[sleep] 当前时间: ${now.toLocaleString()}`);

    // Filter matches within this exact window
    const sleepMatches = matches
        .filter(m => {
            const matchTime = new Date(m.start_time * 1000);
            return matchTime >= windowStart && matchTime <= last2am;
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
        '你可以输给任何人，但唯独不能输给你自己',
        '所有人都想看你跌倒的时候，那恰恰是你站稳的理由',
        '就算全世界都否定你，你也不能否定你自己',
    ],
    terrible: [
        '鏖战到天亮，好像你年轻那样',
        '输了游戏你还有人生',
        '他们都想看你输，可你偏要赢给他们看',
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

// --- Teammate Messages (调侃、阴阳怪气) ---
const TEAMMATE_MESSAGES = {
    excellent: [
        '哟，昨晚睡得挺早嘛，是不是又躺赢了不好意思说？ 😏',
        '早睡早起身体好，可惜早起也救不了你的操作呀 🤣',
        '睡得不错！梦里是不是也在想怎么不被我嘲讽？',
    ],
    good: [
        '还行还行，睡眠质量及格了，游戏质量嘛...咳咳，不说了 🙊',
        '睡得还行，但别以为早睡就能变强，该菜还是菜 🤷',
        '马马虎虎的睡眠，配马马虎虎的技术，挺搭的哈',
    ],
    poor: [
        '又熬夜打Dota？这么努力是想偷偷超过我吗？可惜方向不对啊兄弟 😂',
        '大半夜不睡觉搁这打游戏，明天上线继续坑我是吧？',
        '睡这么晚，难怪操作那么下饭...要不要考虑换个游戏？ 🍚',
    ],
    terrible: [
        '通宵狂打！这股劲头用在工作上你早发财了 💼',
        '凌晨还在打...你这操作对得起你的黑眼圈吗？😂',
        '天都快亮了还搁那打Dota，我愿称你为最强修仙选手 🧘',
    ],
};

const NO_GAME_TEAMMATE = [
    '昨晚居然没上线？是不是怕坑我被我发现？😏',
    '昨晚挂机了？难得啊，是不是女朋友查岗了 👀',
    '哟，昨天没打游戏？改邪归正了？我不信 🤨',
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
export function getSleepMessage(evalResult, isEnemy, heroMap, isTeammate = false) {
    const { quality, lastMatch, matchCount, timeStr, isWin, kda } = evalResult;

    let messages;
    if (isTeammate) {
        messages = TEAMMATE_MESSAGES;
    } else if (isEnemy) {
        messages = CRITICAL_MESSAGES;
    } else {
        messages = GENTLE_MESSAGES;
    }

    // No games in sleep window
    if (matchCount === 0) {
        if (isTeammate) return pick(NO_GAME_TEAMMATE);
        return pick(isEnemy ? NO_GAME_CRITICAL : NO_GAME_GENTLE);
    }

    // Build detailed message
    const heroName = lastMatch && heroMap
        ? (heroMap.get(lastMatch.hero_id)?.localized_name || `英雄${lastMatch.hero_id}`)
        : '英雄';

    let detail = '';
    if (isTeammate) {
        // Teasing/sarcastic tone
        const winText = isWin ? '居然赢了' : '果然又输了';
        detail = `最后一把${heroName}打到${timeStr}，${winText}，KDA ${kda}。`;
        if (isWin && kda >= 5) detail += '可以啊，这把是你C的吧？还是对面太菜？ 🤔';
        else if (isWin && kda < 2) detail += '赢是赢了，但这KDA...躺得舒服吗？ 🛌';
        else if (!isWin && kda >= 3) detail += '数据还行咋还输了？是不是队友坑你？哦不对，你就是那个队友 😂';
        else if (!isWin) detail += '这数据...我觉得不是队友的问题 🤡';
    } else if (isEnemy) {
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

    return pick(messages[quality]) + '\n' + detail;
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

// ============================================================
// Current Session Advice (real-time during 20:00-02:00)
// ============================================================

/**
 * Check if the player is currently in the sleep window (20:00-02:00).
 * If yes, look at the last match in this ongoing session and give real-time advice:
 * - Win → tell them to sleep on a high note
 * - Loss + early → encourage them to keep trying
 * - Loss + late → tell them to try again tomorrow
 *
 * @param {Array} matches - Recent matches
 * @param {Map} heroMap
 * @returns {Object|null} { emoji, message } or null if not in sleep window / no matches
 */
export function getCurrentSessionAdvice(matches, heroMap, isTeammate = false) {
    const now = new Date();
    const hour = now.getHours();

    // Only active during sleep window (20:00-23:59 or 00:00-01:59)
    if (hour < SLEEP_START_HOUR && hour >= SLEEP_END_HOUR) {
        return null; // Outside sleep window
    }

    // Determine the CURRENT (potentially ongoing) sleep window
    const today2am = new Date(now);
    today2am.setHours(2, 0, 0, 0);

    let windowStart;
    if (now < today2am) {
        // Before 02:00 — current window started yesterday 20:00
        windowStart = new Date(today2am);
        windowStart.setDate(windowStart.getDate() - 1);
        windowStart.setHours(20, 0, 0, 0);
    } else {
        // After 20:00 — current window started today 20:00
        windowStart = new Date(now);
        windowStart.setHours(20, 0, 0, 0);
    }

    // Find matches in this current window
    const sessionMatches = matches
        .filter(m => {
            const t = new Date(m.start_time * 1000);
            return t >= windowStart && t <= now;
        })
        .sort((a, b) => a.start_time - b.start_time);

    if (sessionMatches.length === 0) return null;

    const lastMatch = sessionMatches[sessionMatches.length - 1];
    const isWin = (lastMatch.player_slot < 128) === lastMatch.radiant_win;
    const matchHour = new Date(lastMatch.start_time * 1000).getHours();
    const matchMin = new Date(lastMatch.start_time * 1000).getMinutes();
    const timeStr = `${String(matchHour).padStart(2, '0')}:${String(matchMin).padStart(2, '0')}`;

    const heroName = heroMap
        ? (heroMap.get(lastMatch.hero_id)?.localized_name || `英雄${lastMatch.hero_id}`)
        : `英雄${lastMatch.hero_id}`;

    let emoji, message;

    if (isTeammate) {
        if (isWin) {
            if (hour < 23) {
                emoji = '😏';
                message = `${heroName} 在 ${timeStr} 赢了！见好就收吧，别等会又输了赖队友~`;
            } else if (hour < 1) {
                emoji = '🌚';
                message = `${heroName} 在 ${timeStr} 拿下一胜！这么晚了，是不是该睡觉了？明天还要继续坑我呢`;
            } else {
                emoji = '🫠';
                message = `${heroName} 在 ${timeStr} 赢了...凌晨了兄弟，赢了就赶紧睡，别贪！`;
            }
        } else {
            if (hour < 23) {
                emoji = '🤣';
                message = `${heroName} 在 ${timeStr} 输了...没事，反正输赢都是日常，再来一把继续送 😂`;
            } else if (hour < 1) {
                emoji = '🫣';
                message = `${heroName} 在 ${timeStr} 输了...这么晚了还输，心疼你一秒钟，要不明天再战？`;
            } else {
                emoji = '💀';
                message = `${heroName} 在 ${timeStr} 输了...凌晨还在输！兄弟要不要考虑一下卸载？开个玩笑，快去睡吧 😴`;
            }
        }
    } else {
        if (isWin) {
            if (hour < 23) {
                emoji = '🌟';
                message = `${heroName} 在 ${timeStr} 赢了！见好就收，带着胜利的喜悦早点休息吧~`;
            } else if (hour < 1) {
                emoji = '🌙';
                message = `${heroName} 在 ${timeStr} 拿下一胜！很晚了，带着这份开心入睡吧，明天继续连胜！`;
            } else {
                emoji = '✨';
                message = `${heroName} 在 ${timeStr} 赢了！不过已经凌晨了，赶紧睡！明天状态更好~`;
            }
        } else {
            if (hour < 23) {
                emoji = '💪';
                message = `${heroName} 在 ${timeStr} 输了...别灰心，调整一下状态再来一把！`;
            } else if (hour < 1) {
                emoji = '🥺';
                message = `${heroName} 在 ${timeStr} 输了...有点晚了，要不先休息？养足精神明天再战！`;
            } else {
                emoji = '😤';
                message = `${heroName} 在 ${timeStr} 输了...凌晨还输，太伤了！今天就到这吧，明天一定打回来！`;
            }
        }
    }

    return {
        emoji,
        message,
        isWin,
        matchCount: sessionMatches.length,
        timeStr,
    };
}
