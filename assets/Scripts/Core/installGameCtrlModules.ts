import { installAssetBootstrapModule } from './GameCtrlModules/AssetBootstrapModule';
import { installBoardInputViewportModule } from './GameCtrlModules/BoardInputViewportModule';
import { installGameplayLevelFlowModule } from './GameCtrlModules/GameplayLevelFlowModule';
import { installGameplayPlacementFxModule } from './GameCtrlModules/GameplayPlacementFxModule';
import { installGameplaySkillMagnetModule } from './GameCtrlModules/GameplaySkillMagnetModule';
import { installFirstLevelRouteModule } from './GameCtrlModules/FirstLevelRouteModule';
import { installHomeCommerceModule } from './GameCtrlModules/HomeCommerceModule';
import { installHomeAdFlowModule } from './GameCtrlModules/HomeAdFlowModule';
import { installSceneHomeEntryModule } from './GameCtrlModules/SceneHomeEntryModule';
import { installFriendRankModule } from './GameCtrlModules/FriendRankModule';
import { installGameplaySlotSkillModule } from './GameCtrlModules/GameplaySlotSkillModule';
import { installGameplaySkillWandModule } from './GameCtrlModules/GameplaySkillWandModule';
import { installPlayerMetaStateModule } from './GameCtrlModules/PlayerMetaStateModule';
import { installGuideLeaderboardModule } from './GameCtrlModules/GuideLeaderboardModule';
import { installSettlementHudModule } from './GameCtrlModules/SettlementHudModule';
import { installCollectionAvatarModule } from './GameCtrlModules/CollectionAvatarModule';
import { installThemePanelFlowModule } from './GameCtrlModules/ThemePanelFlowModule';
import { installThemeLoadingOverlayModule } from './GameCtrlModules/ThemeLoadingOverlayModule';
import { installSettingsPanelModule } from './GameCtrlModules/SettingsPanelModule';
import { installTutorialGuideModule } from './GameCtrlModules/TutorialGuideModule';
import { installEndgameHintModule } from './GameCtrlModules/EndgameHintModule';
import { installDynamicCountdownDdaModule } from './GameCtrlModules/DynamicCountdownDdaModule';

export function installGameCtrlModules(runtime: any): void {
    if (runtime._gameCtrlModulesInstalled) {
        return;
    }
    runtime._gameCtrlModulesInstalled = true;
    installPlayerMetaStateModule(runtime);
    installFirstLevelRouteModule(runtime);
    installAssetBootstrapModule(runtime);
    installDynamicCountdownDdaModule(runtime);
    installHomeAdFlowModule(runtime);
    installHomeCommerceModule(runtime);
    installSceneHomeEntryModule(runtime);
    installGameplayLevelFlowModule(runtime);
    installGameplaySlotSkillModule(runtime);
    installGameplaySkillWandModule(runtime);
    installGameplaySkillMagnetModule(runtime);
    installBoardInputViewportModule(runtime);
    installGameplayPlacementFxModule(runtime);
    installEndgameHintModule(runtime);
    installSettlementHudModule(runtime);
    installTutorialGuideModule(runtime);
    installGuideLeaderboardModule(runtime);
    installFriendRankModule(runtime);
    installCollectionAvatarModule(runtime);
    installThemePanelFlowModule(runtime);
    installThemeLoadingOverlayModule(runtime);
    installSettingsPanelModule(runtime);
}
