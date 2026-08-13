import { CreationEngine } from "./engine/engine";
import { loadGameData } from "./game/definitions";
import { FIGHTING_GAME_CONFIG } from "./game/gameConfig";
import { MenuFlow } from "./game/menuFlow";

// アプリ全体で共有するPixiJSエンジンを生成する。
const engine = new CreationEngine();

(async () => {
  // 1280×720基準のゲーム描画と60FPS上限を初期化する。
  await engine.init({
    background: FIGHTING_GAME_CONFIG.engine.background,
    resizeOptions: FIGHTING_GAME_CONFIG.engine.resize,
  });
  engine.ticker.maxFPS = FIGHTING_GAME_CONFIG.engine.maxFps;

  // 音量などの利用者設定を読み込む。
  // アセット読み込み中の画面を表示する。
  // CSVとBlender出力の骨格アニメーションを読み込み、Top画面から遷移を開始する。
  new MenuFlow(
    engine,
    await loadGameData(
      FIGHTING_GAME_CONFIG.data,
      FIGHTING_GAME_CONFIG.characterSelect.maxCharacters,
    ),
    FIGHTING_GAME_CONFIG,
  );
})();
