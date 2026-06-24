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
        continueSeconds: 300,
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
        winBonusGold: 50,
    },
    dailySignIn: {
        rewards: [
            { gold: 50 },
            { gold: 80 },
            { gold: 100, freeze: 1 },
            { gold: 120 },
            { gold: 150, brush: 1 },
            { gold: 180 },
            { gold: 260, magnet: 1 },
        ],
    },
} as const;
