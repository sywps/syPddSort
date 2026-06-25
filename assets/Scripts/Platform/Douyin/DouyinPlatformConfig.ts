import type { MiniGamePlatformConfig } from "../PlatformConfig";

export const DOUYIN_PLATFORM_CONFIG: MiniGamePlatformConfig = {
    appId: "ttf45082ed6a36c15802",
    ads: {
        rewardedVideo: "16c514i27srb2n52u4",
    },
};

export const DOUYIN_AD_UNIT_IDS = {
    rewardedVideo: DOUYIN_PLATFORM_CONFIG.ads.rewardedVideo,
    interstitial: "49821n56inb7onej7n",
    banner: "4r1caga286413ava2u",
    daojuRewardedVideo: "7ht6jesae1a1o1wcd3",
    buyLifeRewardedVideo: "3akjmj1hae2d38ddk8",
    addSlotRewardedVideo: "22146aecgb19f35stw",
    testRewardedVideo: "so89260s57143ahcbc",
} as const;
