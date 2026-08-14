import type { GameDataSourcePaths } from "./definitions";
import type { RoomLobbyOptions } from "./roomLobby";

/** 画面デザインを変えずにゲーム内容・接続先を差し替えるための設定。 */
export interface FightingGameConfig {
  readonly engine: {
    readonly background: string;
    readonly maxFps: number;
    readonly resize: {
      readonly minWidth: number;
      readonly minHeight: number;
      readonly letterbox: boolean;
    };
  };
  readonly data: GameDataSourcePaths;
  readonly onlineRoom: RoomLobbyOptions;
  readonly characterSelect: {
    /** CSVに定義できるキャラクター数。選択画面は最大25体に対応する。 */
    readonly maxCharacters: number;
  };
}

/**
 * このゲームを動かす設定の集約地点。
 * CSVパス、合言葉ルームの接続先、選択可能な最大キャラクター数はここだけを編集すれば変更できる。
 */
export const FIGHTING_GAME_CONFIG: FightingGameConfig = {
  engine: {
    background: "#080d1c",
    maxFps: 60,
    resize: { minWidth: 1280, minHeight: 720, letterbox: false },
  },
  data: {
    charactersCsv: "data/characters.csv",
    movesCsv: "data/moves.csv",
    commandsCsv: "data/commands.csv",
  },
  onlineRoom: {
    minPassphraseLength: 4,
    maxPassphraseLength: 32,
    // 同一オリジンのViteプロキシを経由して、画面公開とルーム通信を1本のngrok URLへ集約する。
    endpoint: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/room`,
  },
  characterSelect: {
    maxCharacters: 25,
  },
};
