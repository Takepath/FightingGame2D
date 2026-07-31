import { setEngine } from "./app/getEngine";
import { LoadScreen } from "./app/screens/LoadScreen";
import { userSettings } from "./app/utils/userSettings";
import { CreationEngine } from "./engine/engine";
import { loadGameData } from "./game/definitions";
import { MatchScreen } from "./game/matchScreen";
import { RoomLobby } from "./game/roomLobby";

/** PixiJSサウンド機能をエンジンプラグインとして登録する。 */
import "@pixi/sound";
// import "@esotericsoftware/spine-pixi-v8";

// アプリ全体で共有するPixiJSエンジンを生成する。
const engine = new CreationEngine();
setEngine(engine);

(async () => {
  // 1280×720基準のゲーム描画と60FPS上限を初期化する。
  await engine.init({
    background: "#080d1c",
    resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
  });
  engine.ticker.maxFPS = 60;

  // 音量などの利用者設定を読み込む。
  userSettings.init();

  // アセット読み込み中の画面を表示する。
  await engine.navigation.showScreen(LoadScreen);
  // CSVとBlender出力の骨格アニメーションを読み込んでから対戦画面を作る。
  MatchScreen.configure(await loadGameData());
  await engine.navigation.showScreen(MatchScreen);
  const match = engine.navigation.currentScreen;
  if (match instanceof MatchScreen) {
    // ルーム接続完了・切断のイベントを対戦画面のオンライン状態へ接続する。
    new RoomLobby(
      (client) => match.startOnline(client),
      () => match.stopOnline(),
    );
  }
})();
