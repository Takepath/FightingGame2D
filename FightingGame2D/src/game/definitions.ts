import { Assets } from "pixi.js";

import { csvRecords } from "./csv";
import {
  type AttackLevel,
  type BlenderAnimationData,
  type CharacterDefinition,
  type CommandDefinition,
  type CommandDirection,
  type FighterAction,
  type GameData,
  InputButton,
  type MoveDefinition,
  type MoveUseState,
} from "./types";

/** ゲームデータCSVの読み込み元。ゲーム設定から差し替えられる。 */
export interface GameDataSourcePaths {
  charactersCsv: string;
  movesCsv: string;
  commandsCsv: string;
}

/** キャラクター選択画面が扱える絶対上限。 */
export const MAX_SELECTABLE_CHARACTERS = 25;

/**
 * CSVで定義されたボタン名をゲーム内のInputButton列挙値へ変換する対応表
 */
const buttonNames: Record<string, InputButton> = {
  light: InputButton.Light,
  heavy: InputButton.Heavy,
  special: InputButton.Special,
};

/** commands.csv の sequence で指定できるテンキー方向一覧。 */
const commandDirections = new Set<CommandDirection>([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);

/**
 * ゲーム内リソースのURLを生成する
 * BASE_URLを考慮して相対パスを絶対パスへ変換する
 */
function gameUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

/**
 * テキストファイルを読み込む
 * 読み込みに失敗した場合は例外を送出する
 */
async function loadText(path: string): Promise<string> {
  const response = await fetch(gameUrl(path));
  if (!response.ok)
    throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
  return response.text();
}

/**
 * "#RRGGBB"形式のカラー文字列を数値へ変換する
 */
function toColor(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

/**
 * CSVのアニメーション名をFighterAction型へ変換する
 * 未知の値が指定された場合は"idle"を返す
 */
function toAction(value: string): FighterAction {
  const known: FighterAction[] = [
    "idle",
    "walk",
    "jump",
    "light",
    "heavy",
    "special",
    "hit",
    "block",
    "ko",
  ];

  return known.includes(value as FighterAction)
    ? (value as FighterAction)
    : "idle";
}

/** CSVの use_state を、技の使用可能状態として安全に変換する。 */
function toMoveUseState(value: string): MoveUseState {
  if (value === "air") return "air";
  if (value === "any") return "any";
  return "ground";
}

/** CSVの attack_level を、上・中・下のガード属性として安全に変換する。 */
function toAttackLevel(value: string): AttackLevel {
  if (value === "high" || value === "上") return "high";
  if (value === "low" || value === "下") return "low";
  return "mid";
}

/**
 * キャラクター定義CSVをCharacterDefinition配列へ変換する
 */
function parseCharacters(source: string): CharacterDefinition[] {
  return csvRecords(source).map((row) => ({
    id: row.id,
    name: row.name,

    // 描画方式（未指定時は棒人間）。
    renderType: row.render_type === "blender" ? "blender" : "stick",

    // Blender書き出しJSONの資産パス。
    animationAsset: row.animation_asset,

    // キャラクター選択画面に表示するPNGアイコン
    iconAsset: row.icon_asset,

    // キャラクターカラー
    primaryColor: toColor(row.primary_color),
    accentColor: toColor(row.accent_color),

    // 基本ステータス
    maxHealth: Number(row.max_health),
    walkSpeed: Number(row.walk_speed),
    jumpVelocity: Number(row.jump_velocity),

    // キャラクター本体に沿う被弾判定。未指定時も既定の棒人間サイズを使う。
    hurtboxWidth: Number(row.hurtbox_width) || 52,
    hurtboxTop: Number(row.hurtbox_top) || 150,
    hurtboxBottom: Number(row.hurtbox_bottom) || 24,
  }));
}

/**
 * 技データCSVをMoveDefinition配列へ変換する
 */
function parseMoves(source: string): MoveDefinition[] {
  return csvRecords(source).map((row) => ({
    // 指定が無い場合は全キャラクター共通技
    characterId: row.character_id || "all",

    id: row.move_id,

    // 入力ボタン
    button: buttonNames[row.button.toLowerCase()] ?? InputButton.Light,

    // フレームデータ
    startup: Number(row.startup),
    active: Number(row.active),
    recovery: Number(row.recovery),

    // 攻撃性能
    damage: Number(row.damage),
    rangeX: Number(row.range_x),
    rangeY: Number(row.range_y),
    knockbackX: Number(row.knockback_x),
    knockbackY: Number(row.knockback_y),
    hitstun: Number(row.hitstun),

    // 再生するアニメーション
    animation: toAction(row.animation),

    // 使用可能状態（地上 / 空中 / 両方）
    useState: toMoveUseState(row.use_state),

    // 上・中・下属性（未指定時は中段）
    attackLevel: toAttackLevel(row.attack_level),

    // 攻撃種別（未指定時は近接攻撃）
    attackType: row.attack_type === "projectile" ? "projectile" : "melee",

    // 飛び道具用パラメータ
    projectileSpeed: Number(row.projectile_speed) || 0,
    projectileLifetime: Number(row.projectile_lifetime) || 0,

    // commands.csv を参照する技だけが、方向コマンドを必要とする。
    commandId: row.command_id || null,
  }));
}

/** commands.csv をゲーム内で使う方向コマンド定義へ変換する。 */
function parseCommands(source: string): CommandDefinition[] {
  return csvRecords(source).map((row, index) => {
    const id = row.command_id;
    const sequence = row.sequence
      .split(">")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0);
    const invalidDirection = sequence.find(
      (token) => !commandDirections.has(token as CommandDirection),
    );
    const maxFrames = Number(row.max_frames);

    if (!id) {
      throw new Error(
        `commands.csv の${index + 2}行目に command_id がありません`,
      );
    }
    if (sequence.length === 0 || invalidDirection) {
      throw new Error(
        `commands.csv の ${id} に有効な sequence を指定してください`,
      );
    }
    if (
      !Number.isInteger(maxFrames) ||
      maxFrames < Math.max(0, sequence.length - 1)
    ) {
      throw new Error(
        `commands.csv の ${id} の max_frames は入力間隔を満たす整数にしてください`,
      );
    }

    return {
      id,
      sequence: sequence as CommandDirection[],
      maxFrames,
    };
  });
}

/**
 * ゲームで使用する全データを読み込む
 * - キャラクター定義
 * - 技データ
 * - コマンド定義
 */
export async function loadGameData(
  paths: GameDataSourcePaths,
  maxCharacters = MAX_SELECTABLE_CHARACTERS,
): Promise<GameData> {
  // CSVファイルを並列で読み込む
  const [characterCsv, moveCsv, commandCsv] = await Promise.all([
    loadText(paths.charactersCsv),
    loadText(paths.movesCsv),
    loadText(paths.commandsCsv),
  ]);

  // CSVをゲームデータへ変換
  const characters = parseCharacters(characterCsv);
  const moves = parseMoves(moveCsv);
  const commands = parseCommands(commandCsv);

  // Blender指定キャラクターの、書き出し済みアニメーションJSONを並列で読み込む。
  const blenderAnimations: Record<string, BlenderAnimationData> = {};
  await Promise.all(
    characters
      .filter(
        (character) =>
          character.renderType === "blender" && character.animationAsset,
      )
      .map(async (character) => {
        const response = await fetch(gameUrl(character.animationAsset));

        // アニメーションが存在しない場合は棒人間描画へフォールバック
        if (!response.ok) {
          // 任意アセットの読み込み失敗でゲーム全体を止めず、棒人間描画へフォールバックする。
          console.warn(
            `${character.name} のBlenderアニメーションを読み込めないため棒人間で描画します`,
          );
          return;
        }
        const animation = (await response.json()) as BlenderAnimationData;

        // スプライト形式では、対戦画面を生成する前にPNGをPixiのテクスチャキャッシュへ登録する。
        if (animation.sprite?.asset) {
          await Assets.load(gameUrl(animation.sprite.asset));
        }

        blenderAnimations[character.id] = animation;
      }),
  );

  // 設定値が画面の対応範囲に収まることを先に保証する。
  if (
    !Number.isInteger(maxCharacters) ||
    maxCharacters < 2 ||
    maxCharacters > MAX_SELECTABLE_CHARACTERS
  ) {
    throw new Error(
      `最大キャラクター数は2〜${MAX_SELECTABLE_CHARACTERS}で設定してください`,
    );
  }

  // 対戦ゲームのため最低2キャラクター、選択画面の仕様上は最大25キャラクターに制限する。
  if (characters.length < 2) {
    throw new Error(
      "characters.csv には2人以上のキャラクターを定義してください",
    );
  }
  if (characters.length > maxCharacters) {
    throw new Error(
      `characters.csv は最大${maxCharacters}人まで定義できます（現在${characters.length}人）`,
    );
  }

  // オンライン対戦でCSVのIDを選択値として送るため、重複を禁止する。
  const characterIds = new Set(characters.map((character) => character.id));
  if (characterIds.size !== characters.length) {
    throw new Error("characters.csv の id は重複なしで定義してください");
  }

  // 技から参照するコマンドIDの重複・未定義を早期に検出する。
  const commandIds = new Set(commands.map((command) => command.id));
  if (commandIds.size !== commands.length) {
    throw new Error("commands.csv の command_id は重複なしで定義してください");
  }
  for (const move of moves) {
    if (move.commandId !== null && !commandIds.has(move.commandId)) {
      throw new Error(
        `moves.csv の ${move.id} が未定義の command_id (${move.commandId}) を参照しています`,
      );
    }
  }

  // 全ゲームデータを返す
  return {
    characters,
    moves,
    commands,
    blenderAnimations,
  };
}
