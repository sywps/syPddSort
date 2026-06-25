export type RewardedAdPlatformConfig = {
    readonly rewardedVideo: string;
};

export type MiniGamePlatformConfig = {
    readonly appId: string;
    readonly ads: RewardedAdPlatformConfig;
};
