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
  type ProjectileDefinition,
  type ProjectileRenderType,
} from "./types";

/** ゲームデータCSVの読み込み元。ゲーム設定から差し替えられる。 */
export interface GameDataSourcePaths {
  charactersCsv: string;
  movesCsv: string;
  commandsCsv: string;
  projectilesCsv: string;
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
  throw: InputButton.Throw,
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

/** 飛び道具用の色を読み込み、未指定時は既定色へ戻す。 */
function toColorOr(value: string, fallback: number): number {
  const color = toColor(value);
  return Number.isFinite(color) ? color : fallback;
}

/** CSVの正の数値を読み込み、未指定・不正値は既定値へ戻す。 */
function toPositiveNumber(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** CSVの飛び道具描画方式を、対応済みの方式へ正規化する。 */
function toProjectileRenderType(value: string): ProjectileRenderType {
  return value === "sprite" ? "sprite" : "circle";
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

/** moves.csv の guard_bleak を、ガード貫通設定へ変換する。 */
function toGuardBleak(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * moves.csv の cancel_into を、キャンセル開始できる攻撃ボタン種別へ変換する。
 * 複数指定は light|heavy|special|throw のように | で区切り、未知の値は無視する。
 */
function toCancelInto(value: string | undefined): readonly InputButton[] {
  const buttons = new Set<InputButton>();
  for (const name of (value ?? "").split("|")) {
    const button = buttonNames[name.trim().toLowerCase()];
    if (button !== undefined) buttons.add(button);
  }
  return [...buttons];
}

/**
 * moves.csv の command_idをコマンドID配列へ変換する。
 * hadoken|hadoken_simple のように書くと、いずれかの入力で同じ技を実行できる。
 */
function toCommandIds(value: string | undefined): readonly string[] {
  return [
    ...new Set(
      (value ?? "")
        .split("|")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
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
    // CSV読込時はデフォルト色とし、選択画面で対戦用の色へ差し替える。
    colorVariant: "default",
    primaryColor: toColor(row.primary_color),
    accentColor: toColor(row.accent_color),

    // 基本ステータス
    // max_health は damage と同じ実数HPポイントで管理する。
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
    // 割合へ換算せず、CSVに記述した実数HPポイントをそのまま使用する。
    damage: Number(row.damage),
    // 空欄は消費なしとして扱い、既存の通常技をそのまま利用できるようにする。
    specialGaugeCost: row.special_gauge_cost
      ? Number(row.special_gauge_cost)
      : 0,
    // 技を開始した時点で加算する超必殺ゲージ量。空欄は0として既存CSVとも互換にする。
    superGaugeGain: row.super_gauge_gain ? Number(row.super_gauge_gain) : 0,
    // guard_bleak=trueの技は後ろ入力ガードを無視してダメージを与える。
    guardPiercing: toGuardBleak(row.guard_bleak),
    // コンボ始動補正は未指定時を0%として扱い、従来CSVも読み込めるようにする。
    starterProration: Number(row.starter_proration) || 0,
    // 硬直キャンセル先は light|heavy|special|throw の組み合わせでCSVに登録する。
    cancelInto: toCancelInto(row.cancel_into),
    rangeX: Number(row.range_x),
    rangeY: Number(row.range_y),
    // 技開始時に攻撃側へ与える移動量。正のY値は上方向へ移動する。
    selfMoveX: Number(row.self_move_x) || 0,
    selfMoveY: Number(row.self_move_y) || 0,
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
    // projectiles.csv の見た目定義を参照するID。近接技は空欄のままにする。
    projectileId: row.projectile_id || null,

    // command_idは|区切りで複数参照でき、いずれかのコマンドで技を実行できる。
    commandIds: toCommandIds(row.command_id),
  }));
}

/** projectiles.csvを飛び道具の見た目定義へ変換する。 */
function parseProjectileDefinitions(source: string): ProjectileDefinition[] {
  return csvRecords(source).map((row) => ({
    id: row.id,
    renderType: toProjectileRenderType(row.render_type),
    asset: row.asset,
    width: toPositiveNumber(row.width, 44),
    height: toPositiveNumber(row.height, 44),
    outerRadius: toPositiveNumber(row.outer_radius, 22),
    middleRadius: toPositiveNumber(row.middle_radius, 14),
    coreRadius: toPositiveNumber(row.core_radius, 7),
    outerColor: toColorOr(row.outer_color, 0x4fd8ff),
    middleColor: toColorOr(row.middle_color, 0x4fd8ff),
    coreColor: toColorOr(row.core_color, 0xe8f8ff),
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
    // priority未指定の旧CSVは0として読み込み、既存のコマンド定義を壊さない。
    const priority = row.priority ? Number(row.priority) : 0;

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
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
      throw new Error(
        `commands.csv の ${id} の priority は0〜100の整数を指定してください`,
      );
    }

    return {
      id,
      sequence: sequence as CommandDirection[],
      maxFrames,
      priority,
    };
  });
}

/**
 * ゲームで使用する全データを読み込む
 * - キャラクター定義
 * - 技データ
 * - コマンド定義
 * - 飛び道具の見た目定義
 */
export async function loadGameData(
  paths: GameDataSourcePaths,
  maxCharacters = MAX_SELECTABLE_CHARACTERS,
): Promise<GameData> {
  // CSVファイルを並列で読み込む
  const [characterCsv, moveCsv, commandCsv, projectileCsv] = await Promise.all([
    loadText(paths.charactersCsv),
    loadText(paths.movesCsv),
    loadText(paths.commandsCsv),
    loadText(paths.projectilesCsv),
  ]);

  // CSVをゲームデータへ変換
  const characters = parseCharacters(characterCsv);
  const moves = parseMoves(moveCsv);
  const commands = parseCommands(commandCsv);
  const projectileDefinitions = parseProjectileDefinitions(projectileCsv);

  // PNGスプライトを使う飛び道具は、対戦画面へ進む前にテクスチャを読み込む。
  await Promise.all(
    projectileDefinitions
      .filter(
        (projectile) => projectile.renderType === "sprite" && projectile.asset,
      )
      .map((projectile) => Assets.load(gameUrl(projectile.asset))),
  );

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
  // HPとダメージは同じ単位の整数ポイントとして扱い、割合指定や小数値を受け付けない。
  for (const character of characters) {
    if (!Number.isInteger(character.maxHealth) || character.maxHealth <= 0) {
      throw new Error(
        `characters.csv の ${character.id} の max_health は1以上の整数HPを指定してください`,
      );
    }
  }
  for (const move of moves) {
    if (!Number.isInteger(move.damage) || move.damage < 0) {
      throw new Error(
        `moves.csv の ${move.id} の damage は0以上の整数ダメージを指定してください`,
      );
    }
    if (
      !Number.isInteger(move.specialGaugeCost) ||
      move.specialGaugeCost < 0 ||
      move.specialGaugeCost > 100
    ) {
      throw new Error(
        `moves.csv の ${move.id} の special_gauge_cost は0〜100の整数を指定してください`,
      );
    }
    if (
      !Number.isInteger(move.superGaugeGain) ||
      move.superGaugeGain < 0 ||
      move.superGaugeGain > 300
    ) {
      throw new Error(
        `moves.csv の ${move.id} の super_gauge_gain は0〜300の整数を指定してください`,
      );
    }
    if (!Number.isInteger(move.starterProration)) {
      throw new Error(
        `moves.csv の ${move.id} の starter_proration は整数パーセントを指定してください`,
      );
    }
  }

  const characterIds = new Set(characters.map((character) => character.id));
  if (characterIds.size !== characters.length) {
    throw new Error("characters.csv の id は重複なしで定義してください");
  }

  // 同一キャラクター内の技ID重複は、実行中の技検索で先頭行だけが残るため禁止する。
  const moveKeys = moves.map((move) => `${move.characterId}:${move.id}`);
  if (new Set(moveKeys).size !== moveKeys.length) {
    throw new Error(
      "moves.csv の character_id と move_id の組み合わせは重複なしで定義してください",
    );
  }

  // 技から参照するコマンドIDの重複・未定義を早期に検出する。
  const commandIds = new Set(commands.map((command) => command.id));
  if (commandIds.size !== commands.length) {
    throw new Error("commands.csv の command_id は重複なしで定義してください");
  }
  for (const move of moves) {
    for (const commandId of move.commandIds) {
      if (commandIds.has(commandId)) continue;
      throw new Error(
        `moves.csv の ${move.id} が未定義の command_id (${commandId}) を参照しています`,
      );
    }
  }

  // 飛び道具IDの重複や、技CSVからの不正な参照を起動時に検出する。
  const projectileIds = new Set(
    projectileDefinitions.map((projectile) => projectile.id),
  );
  if (
    projectileDefinitions.some((projectile) => !projectile.id) ||
    projectileIds.size !== projectileDefinitions.length
  ) {
    throw new Error("projectiles.csv の id は空欄・重複なしで定義してください");
  }
  for (const projectile of projectileDefinitions) {
    if (projectile.renderType === "sprite" && !projectile.asset) {
      throw new Error(
        `projectiles.csv の ${projectile.id} は sprite の asset を指定してください`,
      );
    }
  }
  for (const move of moves) {
    if (move.attackType === "projectile") {
      if (!move.projectileId || !projectileIds.has(move.projectileId)) {
        throw new Error(
          `moves.csv の ${move.id} は有効な projectile_id を指定してください`,
        );
      }
    } else if (move.projectileId !== null) {
      throw new Error(
        `moves.csv の近接技 ${move.id} に projectile_id は指定できません`,
      );
    }
  }

  // 全ゲームデータを返す
  return {
    characters,
    moves,
    commands,
    projectileDefinitions,
    blenderAnimations,
  };
}
