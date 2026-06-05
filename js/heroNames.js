// ============================================================
// heroNames.js — Chinese hero name mapping (internal_name → 中文名)
// Internal names from Dota 2 are stable across patches, unlike hero_id.
// ============================================================

const HERO_NAMES_ZH = {
    antimage: '敌法师',
    axe: '斧王',
    bane: '祸乱之源',
    bloodseeker: '嗜血狂魔',
    crystal_maiden: '水晶室女',
    drow_ranger: '卓尔游侠',
    earthshaker: '撼地者',
    juggernaut: '主宰',
    mirana: '米拉娜',
    morphling: '变体精灵',
    nevermore: '影魔',
    phantom_lancer: '幻影长矛手',
    puck: '帕克',
    pudge: '屠夫',
    razor: '剃刀',
    sand_king: '沙王',
    storm_spirit: '风暴之灵',
    sven: '斯温',
    tiny: '小小',
    vengefulspirit: '复仇之魂',
    windrunner: '风行者',
    zuus: '宙斯',
    kunkka: '昆卡',
    lina: '莉娜',
    lion: '莱恩',
    shadow_shaman: '暗影萨满',
    slardar: '斯拉达',
    tidehunter: '潮汐猎人',
    witch_doctor: '巫医',
    lich: '巫妖',
    riki: '力丸',
    enigma: '谜团',
    tinker: '修补匠',
    sniper: '狙击手',
    necrolyte: '瘟疫法师',
    warlock: '术士',
    spectre: '幽鬼',
    venomancer: '剧毒术士',
    faceless_void: '虚空假面',
    skeleton_king: '冥魂大帝',
    death_prophet: '死亡先知',
    phantom_assassin: '幻影刺客',
    pugna: '帕格纳',
    templar_assassin: '圣堂刺客',
    viper: '冥界亚龙',
    luna: '露娜',
    dragon_knight: '龙骑士',
    dazzle: '戴泽',
    rattletrap: '发条技师',
    leshrac: '拉席克',
    furion: '先知',
    life_stealer: '噬魂鬼',
    dark_seer: '黑暗贤者',
    clinkz: '克林克兹',
    omniknight: '全能骑士',
    enchantress: '魅惑魔女',
    huskar: '哈斯卡',
    night_stalker: '暗夜魔王',
    broodmother: '育母蜘蛛',
    bounty_hunter: '赏金猎人',
    weaver: '编织者',
    jakiro: '杰奇洛',
    batrider: '蝙蝠骑士',
    chen: '陈',
    doom_bringer: '末日使者',
    ancient_apparition: '远古冰魄',
    ursa: '熊战士',
    spirit_breaker: '裂魂人',
    gyrocopter: '矮人直升机',
    alchemist: '炼金术士',
    invoker: '祈求者',
    silencer: '沉默术士',
    treant: '树精卫士',
    ogre_magi: '食人魔魔法师',
    obsidian_destroyer: '殁境神蚀者',
    lycan: '狼人',
    brewmaster: '酒仙',
    shadow_demon: '暗影恶魔',
    lone_druid: '德鲁伊',
    chaos_knight: '混沌骑士',
    meepo: '米波',
    naga_siren: '娜迦海妖',
    nyx_assassin: '司夜刺客',
    disruptor: '干扰者',
    rubick: '拉比克',
    wisp: '艾欧',
    visage: '维萨吉',
    medusa: '美杜莎',
    troll_warlord: '巨魔战将',
    centaur: '半人马战行者',
    magnataur: '马格纳斯',
    bristleback: '钢背兽',
    tusk: '巨牙海民',
    shredder: '伐木机',
    abaddon: '亚巴顿',
    elder_titan: '上古巨神',
    legion_commander: '军团指挥官',
    ember_spirit: '灰烬之灵',
    earth_spirit: '大地之灵',
    abyssal_underlord: '孽主',
    terrorblade: '恐怖利刃',
    phoenix: '凤凰',
    oracle: '神谕者',
    techies: '工程师',
    winter_wyvern: '寒冬飞龙',
    arc_warden: '天穹守望者',
    monkey_king: '齐天大圣',
    dark_willow: '邪影芳灵',
    pangolier: '石鳞剑士',
    grimstroke: '天涯墨客',
    mars: '玛尔斯',
    hoodwink: '森海飞霞',
    void_spirit: '虚无之灵',
    snapfire: '电炎绝手',
    dawnbreaker: '破晓辰星',
    muerta: '琼英碧灵',
    ringmaster: '百戏大王',
    kez: '凯',
    primal_beast: '兽王',
    marci: '玛西',
};

/**
 * Get the Chinese name for a hero.
 * Falls back to English localized_name from heroMap, then hero_id.
 * @param {number} heroId
 * @param {Map} heroMap - Map of hero_id → { name, localized_name, ... }
 * @returns {string}
 */
export function getHeroDisplayName(heroId, heroMap) {
    if (!heroMap) return `Hero ${heroId}`;

    const hero = heroMap.get(heroId);
    if (!hero) return `Hero ${heroId}`;

    // 1. Look up Chinese name by internal name
    if (hero.name && HERO_NAMES_ZH[hero.name]) {
        return HERO_NAMES_ZH[hero.name];
    }

    // 2. Fall back to English localized_name from API
    if (hero.localized_name) {
        return hero.localized_name;
    }

    return `Hero ${heroId}`;
}

/**
 * Enrich all hero map entries with Chinese display names.
 * Sets hero.localized_name to the Chinese name if available.
 * @param {Map} heroMap
 * @returns {Map}
 */
export function enrichHeroMapWithChinese(heroMap) {
    for (const [id, hero] of heroMap) {
        if (hero.name && HERO_NAMES_ZH[hero.name]) {
            hero._name_en = hero.localized_name;
            hero.localized_name = HERO_NAMES_ZH[hero.name];
        }
    }
    return heroMap;
}
