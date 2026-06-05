// ============================================================
// config.js — Constants and Configuration
// ============================================================

/** OpenDota API base URL */
export const API_BASE = 'https://api.opendota.com/api/';

/** Steam CDN for hero/rank images */
export const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com';

/** Game mode IDs — both may represent Turbo mode */
export const GAME_MODE = {
    TURBO: 23,       // Official Turbo mode (DotaGamemodeTurbo)
    ALL_DRAFT: 22,   // All Draft, historically used for Turbo
};

/** All mode IDs that should be treated as Turbo */
export const TURBO_MODES = [22, 23];

/** Cache TTLs in milliseconds */
export const CACHE_TTL = {
    HEROES: 7 * 24 * 60 * 60 * 1000,    // 7 days — rarely changes
    PLAYER: 5 * 60 * 1000,               // 5 minutes
    COUNTS: 5 * 60 * 1000,               // 5 minutes
    STATS: 5 * 60 * 1000,                // 5 minutes (wl, heroes, totals)
};

/** localStorage key prefix */
export const STORAGE_KEYS = {
    HEROES: 'dd2_heroes',
    PLAYER_PREFIX: 'dd2_player_',        // + accountId
    COUNTS_PREFIX: 'dd2_counts_',        // + accountId
    STATS_PREFIX: 'dd2_stats_',          // + accountId + '_' + mode
    PLAYER_LIST: 'dd2_player_list',      // { myId: string, enemyIds: [], teammateIds: [] }
    CACHE_VERSION: 'dd2_cache_version',  // number — bump to clear stale cache
};

/** Current cache version — bump this to invalidate all cached API data */
export const CACHE_VERSION = 2;

/** Rate limit thresholds */
export const RATE_LIMIT = {
    WARN_THRESHOLD: 10,     // Show warning when < 10 remaining per minute
    DANGER_THRESHOLD: 3,    // Show danger when < 3 remaining
};

/** Input validation */
export const VALIDATION = {
    MIN_ID_LENGTH: 4,
    MAX_ID_LENGTH: 17,       // Steam64 can be 17 digits
    PATTERN: /^\d+$/,
};

/** Steam ID conversion */
export const STEAM_ID_OFFSET = 76561197960265728n;

/** Request timeout in ms */
export const REQUEST_TIMEOUT = 15000;

/** Number of recent matches to show */
export const MAX_DISPLAY_MATCHES = 50;

/** Number of heroes to show in table before "show more" */
export const INITIAL_HERO_ROWS = 15;

/** Rank tier → medal name mapping */
export const RANK_MEDALS = {
    1:  { tier: 'Herald',     star: 1,  name: '先锋 I' },
    2:  { tier: 'Herald',     star: 2,  name: '先锋 II' },
    3:  { tier: 'Herald',     star: 3,  name: '先锋 III' },
    4:  { tier: 'Herald',     star: 4,  name: '先锋 IV' },
    5:  { tier: 'Herald',     star: 5,  name: '先锋 V' },
    6:  { tier: 'Guardian',   star: 1,  name: '卫士 I' },
    7:  { tier: 'Guardian',   star: 2,  name: '卫士 II' },
    8:  { tier: 'Guardian',   star: 3,  name: '卫士 III' },
    9:  { tier: 'Guardian',   star: 4,  name: '卫士 IV' },
    10: { tier: 'Guardian',   star: 5,  name: '卫士 V' },
    11: { tier: 'Crusader',   star: 1,  name: '十字军 I' },
    12: { tier: 'Crusader',   star: 2,  name: '十字军 II' },
    13: { tier: 'Crusader',   star: 3,  name: '十字军 III' },
    14: { tier: 'Crusader',   star: 4,  name: '十字军 IV' },
    15: { tier: 'Crusader',   star: 5,  name: '十字军 V' },
    16: { tier: 'Archon',     star: 1,  name: '执政官 I' },
    17: { tier: 'Archon',     star: 2,  name: '执政官 II' },
    18: { tier: 'Archon',     star: 3,  name: '执政官 III' },
    19: { tier: 'Archon',     star: 4,  name: '执政官 IV' },
    20: { tier: 'Archon',     star: 5,  name: '执政官 V' },
    21: { tier: 'Legend',     star: 1,  name: '传奇 I' },
    22: { tier: 'Legend',     star: 2,  name: '传奇 II' },
    23: { tier: 'Legend',     star: 3,  name: '传奇 III' },
    24: { tier: 'Legend',     star: 4,  name: '传奇 IV' },
    25: { tier: 'Legend',     star: 5,  name: '传奇 V' },
    26: { tier: 'Ancient',    star: 1,  name: '万古流芳 I' },
    27: { tier: 'Ancient',    star: 2,  name: '万古流芳 II' },
    28: { tier: 'Ancient',    star: 3,  name: '万古流芳 III' },
    29: { tier: 'Ancient',    star: 4,  name: '万古流芳 IV' },
    30: { tier: 'Ancient',    star: 5,  name: '万古流芳 V' },
    31: { tier: 'Divine',     star: 1,  name: '超凡入圣 I' },
    32: { tier: 'Divine',     star: 2,  name: '超凡入圣 II' },
    33: { tier: 'Divine',     star: 3,  name: '超凡入圣 III' },
    34: { tier: 'Divine',     star: 4,  name: '超凡入圣 IV' },
    35: { tier: 'Divine',     star: 5,  name: '超凡入圣 V' },
    36: { tier: 'Immortal',   star: 0,  name: '冠绝一世' },
};

/** Lobby type names */
export const LOBBY_NAMES = {
    0: '普通匹配',
    1: '练习',
    2: '锦标赛',
    3: '教程',
    4: '人机合作',
    5: '队长模式队伍',
    6: '单排',
    7: '天梯匹配',
    8: '1v1 中路',
    9: '勇士联赛',
};

/** Region names */
export const REGION_NAMES = {
    1: '美西', 2: '美东', 3: '欧洲', 5: '新加坡',
    6: '迪拜', 7: '澳洲', 8: '斯德哥尔摩', 9: '奥地利',
    10: '巴西', 11: '南非', 12: '韩国', 13: '国服',
    14: '智利', 15: '秘鲁', 16: '印度', 17: '日本',
    18: '东南亚', 19: '阿根廷', 20: '台湾', 25: '国服电信',
};

/**
 * Dota 2 patch number → game version mapping.
 * Patch numbers come from OpenDota /counts API.
 * Mappings are best-effort; Valve doesn't document this publicly.
 */
export const PATCH_VERSIONS = {
    8: '7.00',
    9: '7.01',
    10: '7.02',
    11: '7.03',
    12: '7.06',
    13: '7.07',
    14: '7.08',
    15: '7.10',
    16: '7.14',
    17: '7.16',
    18: '7.19',
    19: '7.20',
    20: '7.21',
    21: '7.22',
    22: '7.23',
    23: '7.24',
    24: '7.25',
    25: '7.26',
    26: '7.27',
    27: '7.28',
    28: '7.29',
    30: '7.30',
    31: '7.31',
    33: '7.32',
    37: '7.33',
    38: '7.34',
    39: '7.35',
    40: '7.36',
    43: '7.37',
    49: '7.38',
    53: '7.39',
    59: '7.40',
    60: '7.41',
};
