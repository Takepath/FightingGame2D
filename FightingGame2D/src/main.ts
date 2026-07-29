import { setEngine } from "./app/getEngine";
import { LoadScreen } from "./app/screens/LoadScreen";
import { userSettings } from "./app/utils/userSettings";
import { CreationEngine } from "./engine/engine";
import { loadGameData } from "./game/definitions";
import { MatchScreen } from "./game/matchScreen";
import { RoomLobby } from "./game/roomLobby";

/**
 * Importing these modules will automatically register there plugins with the engine.
 */
import "@pixi/sound";
// import "@esotericsoftware/spine-pixi-v8";

// Create a new creation engine instance
const engine = new CreationEngine();
setEngine(engine);

(async () => {
  // Initialize the creation engine instance
  await engine.init({
    background: "#080d1c",
    resizeOptions: { minWidth: 1280, minHeight: 720, letterbox: false },
  });
  engine.ticker.maxFPS = 60;

  // Initialize the user settings
  userSettings.init();

  // Show the load screen
  await engine.navigation.showScreen(LoadScreen);
  // CSV and Blender-exported skeletal samples are loaded before the first match.
  MatchScreen.configure(await loadGameData());
  await engine.navigation.showScreen(MatchScreen);
  const match = engine.navigation.currentScreen;
  if (match instanceof MatchScreen) {
    new RoomLobby(
      (client) => match.startOnline(client),
      () => match.stopOnline(),
    );
  }
})();
