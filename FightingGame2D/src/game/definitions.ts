import { csvRecords } from "./csv";
import {
  type BlenderAnimationData,
  type CharacterDefinition,
  type FighterAction,
  type GameData,
  InputButton,
  type MoveDefinition,
} from "./types";

/**
 * CSVで定義されたボタン名をゲーム内のInputButton列挙値へ変換する対応表
 */
const buttonNames: Record<string, InputButton> = {
  light: InputButton.Light,
  heavy: InputButton.Heavy,
  special: InputButton.Special,
};

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

/**
 * キャラクター定義CSVをCharacterDefinition配列へ変換する
 */
function parseCharacters(source: string): CharacterDefinition[] {
  return csvRecords(source).map((row) => ({
    id: row.id,
    name: row.name,

    // 描画方式（未指定時は棒人間）
    renderType: row.render_type === "blender" ? "blender" : "stick",

    // Blenderアニメーションファイル
    animationAsset: row.animation_asset,

    // キャラクターカラー
    primaryColor: toColor(row.primary_color),
    accentColor: toColor(row.accent_color),

    // 基本ステータス
    maxHealth: Number(row.max_health),
    walkSpeed: Number(row.walk_speed),
    jumpVelocity: Number(row.jump_velocity),
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

    // 攻撃種別（未指定時は近接攻撃）
    attackType: row.attack_type === "projectile" ? "projectile" : "melee",

    // 飛び道具用パラメータ
    projectileSpeed: Number(row.projectile_speed) || 0,
    projectileLifetime: Number(row.projectile_lifetime) || 0,
  }));
}

/**
 * ゲームで使用する全データを読み込む
 * - キャラクター定義
 * - 技データ
 * - Blenderアニメーション
 */
export async function loadGameData(): Promise<GameData> {
  // CSVファイルを並列で読み込む
  const [characterCsv, moveCsv] = await Promise.all([
    loadText("data/characters.csv"),
    loadText("data/moves.csv"),
  ]);

  // CSVをゲームデータへ変換
  const characters = parseCharacters(characterCsv);
  const moves = parseMoves(moveCsv);

  // キャラクターごとのBlenderアニメーションを保持
  const blenderAnimations: Record<string, BlenderAnimationData> = {};

  // Blender描画キャラクターのアニメーションを並列読み込み
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
          console.warn(
            `${character.name} のBlenderアニメーションを読み込めないため棒人間で描画します`,
          );
          return;
        }

        // 読み込んだアニメーションデータを保存
        blenderAnimations[character.id] =
          (await response.json()) as BlenderAnimationData;
      }),
  );

  // 対戦ゲームのため最低2キャラクター必要
  if (characters.length < 2) {
    throw new Error(
      "characters.csv には2人以上のキャラクターを定義してください",
    );
  }

  // 全ゲームデータを返す
  return {
    characters,
    moves,
    blenderAnimations,
  };
}
