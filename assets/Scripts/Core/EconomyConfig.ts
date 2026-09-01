export const ECONOMY_NUMERIC_TABLE = {
    purchaseCost: {
        fullVigor: 120,
        magicWand: 250,
        freeze: 250,
        brush: 250,
        magnet: 250,
        reviveContinue: 100,
    },
    revive: {
        continueSeconds: 120,
    },
    reward: {
        winGoldMin: 10,
        winGoldPerCell: 0.18,
        levelBonusEvery: 10,
        levelBonusStep: 1,
        levelBonusMax: 10,
        themeWinGoldBonus: 8,
        largePlacementBeanThreshold: 20,
        largePlacementGoldBonus: 5,
    },
    adReward: {
        goldShopReward: 30,
        winTotalMultiplier: 5,
    },
} as const;
