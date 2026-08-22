import { CreationEngine } from "./engine/engine";
import { loadGameData } from "./game/definitions";
import {
  FIGHTING_GAME_CONFIG,
  validateFightingGameConfig,
} from "./game/gameConfig";
import { MenuFlow } from "./game/menuFlow";

/** CSV・設定エラーを画面へ表示し、編集者が黒画面から原因を探す必要をなくす。 */
function showStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  document
    .querySelectorAll<HTMLElement>(".menu-layer, .modal-layer")
    .forEach((element) => element.classList.add("is-hidden"));
  document.getElementById("startup-error-message")!.textContent = message;
  document.getElementById("startup-error")!.classList.remove("is-hidden");
  console.error(error);
}

/** 設定検証からデータ読込、メニュー表示までの起動処理。 */
async function startGame(): Promise<void> {
  // アプリ全体で共有するPixiJSエンジンを生成する。
  const engine = new CreationEngine();
  // 設定間の矛盾はCSV・アセット読込より前に検出する。
  validateFightingGameConfig(FIGHTING_GAME_CONFIG);
  // 1280×720基準のゲーム描画と60FPS上限を初期化する。
  await engine.init({
    background: FIGHTING_GAME_CONFIG.engine.background,
    resizeOptions: FIGHTING_GAME_CONFIG.engine.resize,
  });
  engine.ticker.maxFPS = FIGHTING_GAME_CONFIG.engine.fixedFps;

  // 音量などの利用者設定を読み込む。
  // アセット読み込み中の画面を表示する。
  // CSVとBlender出力の骨格アニメーションを読み込み、Top画面から遷移を開始する。
  new MenuFlow(
    engine,
    await loadGameData(
      FIGHTING_GAME_CONFIG.data,
      FIGHTING_GAME_CONFIG.characterSelect.maxCharacters,
    ),
  );
}

void startGame().catch(showStartupError);
