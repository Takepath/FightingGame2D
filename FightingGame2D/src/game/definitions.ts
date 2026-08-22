import { Assets } from "pixi.js";

import { gameAssetUrl } from "./assets";
import { csvRecords } from "./csv";
import { FIGHTING_GAME_CONFIG, MAX_SUPPORTED_CHARACTERS } from "./gameConfig";
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
} from "./types";

/** ゲームデータCSVの読み込み元。ゲーム設定から差し替えられる。 */
export interface GameDataSourcePaths {
  charactersCsv: string;
  movesCsv: string;
  commandsCsv: string;
  projectilesCsv: string;
}

/** キャラクター選択画面が扱える絶対上限。 */
export const MAX_SELECTABLE_CHARACTERS = MAX_SUPPORTED_CHARACTERS;

/** CSVの列順には依存せず、実行に必要な列名だけを起動時に検証する。 */
const CHARACTER_HEADERS = [
  "id",
  "name",
  "render_type",
  "animation_asset",
  "icon_asset",
  "primary_color",
  "accent_color",
  "max_health",
  "walk_speed",
  "jump_velocity",
  "hurtbox_width",
  "hurtbox_top",
  "hurtbox_bottom",
] as const;
const MOVE_HEADERS = [
  "character_id",
  "move_id",
  "button",
  "startup",
  "active",
  "recovery",
  "invincible_frames",
  "damage",
  "special_gauge_cost",
  "super_gauge_gain",
  "guard_bleak",
  "starter_proration",
  "range_x",
  "range_y",
  "self_move_x",
  "self_move_y",
  "knockback_x",
  "knockback_y",
  "guard_knockback_x",
  "guard_self_knockback_x",
  "hitstun",
  "guard_stun",
  "animation",
  "attack_type",
  "projectile_speed",
  "projectile_lifetime",
  "use_state",
  "attack_level",
  "projectile_id",
  "command_id",
  "cancel_into",
] as const;
const COMMAND_HEADERS = [
  "command_id",
  "sequence",
  "max_frames",
  "priority",
  "charge_frames",
] as const;
const PROJECTILE_HEADERS = [
  "id",
  "render_type",
  "asset",
  "width",
  "height",
  "outer_radius",
  "middle_radius",
  "core_radius",
  "outer_color",
  "middle_color",
  "core_color",
] as const;

/** CSV編集エラーへファイル名・行・列を付け、設定箇所をすぐ特定できるようにする。 */
function dataError(
  fileName: string,
  line: number,
  column: string,
  message: string,
): never {
  throw new Error(`${fileName} の${line}行目 ${column}: ${message}`);
}

/** 必須文字列を読み込み、空欄なら列位置付きで停止する。 */
function requiredText(
  row: Record<string, string>,
  column: string,
  fileName: string,
  line: number,
): string {
  const value = row[column]?.trim() ?? "";
  return value || dataError(fileName, line, column, "空欄にできません");
}

/** 数値セルを有限値として読み込み、必要なら整数・下限・上限も検証する。 */
function dataNumber(
  row: Record<string, string>,
  column: string,
  fileName: string,
  line: number,
  options: {
    readonly integer?: boolean;
    readonly min?: number;
    readonly max?: number;
  } = {},
): number {
  const raw = requiredText(row, column, fileName, line);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    dataError(fileName, line, column, "有限の数値を指定してください");
  }
  if (options.integer && !Number.isInteger(value)) {
    dataError(fileName, line, column, "整数を指定してください");
  }
  if (options.min !== undefined && value < options.min) {
    dataError(fileName, line, column, `${options.min}以上を指定してください`);
  }
  if (options.max !== undefined && value > options.max) {
    dataError(fileName, line, column, `${options.max}以下を指定してください`);
  }
  return value;
}

/** #RRGGBB形式だけを受け付け、NaN色が描画へ混入することを防ぐ。 */
function dataColor(
  row: Record<string, string>,
  column: string,
  fileName: string,
  line: number,
): number {
  const value = requiredText(row, column, fileName, line);
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    dataError(fileName, line, column, "#RRGGBB形式で指定してください");
  }
  return Number.parseInt(value.slice(1), 16);
}

/** 区切り文字や通信キーと衝突しない、CSV内部IDの共通書式。 */
const DATA_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 必須IDを読み、予約語と書式を列位置付きで検証する。 */
function dataId(
  row: Record<string, string>,
  column: string,
  fileName: string,
  line: number,
  options: { readonly forbidAll?: boolean } = {},
): string {
  const value = requiredText(row, column, fileName, line);
  if (!DATA_ID_PATTERN.test(value)) {
    dataError(
      fileName,
      line,
      column,
      "64文字以内の半角英数字・_・-で指定してください",
    );
  }
  if (options.forbidAll && value === "all") {
    dataError(fileName, line, column, "予約ID all は使用できません");
  }
  return value;
}

/** 空欄を許す|区切り列を解析し、途中の空要素と重複を拒否する。 */
function optionalList(
  row: Record<string, string>,
  column: string,
  fileName: string,
  line: number,
): string[] {
  const source = row[column]?.trim() ?? "";
  if (!source) return [];
  const values = source.split("|").map((value) => value.trim());
  if (values.some((value) => value.length === 0)) {
    dataError(fileName, line, column, "|の間に空の値を指定できません");
  }
  if (new Set(values).size !== values.length) {
    dataError(fileName, line, column, "同じ値を重複して指定できません");
  }
  return values;
}

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
 * テキストファイルを読み込む
 * 読み込みに失敗した場合は例外を送出する
 */
async function loadText(path: string): Promise<string> {
  const response = await fetch(gameAssetUrl(path));
  if (!response.ok)
    throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
  return response.text();
}

/**
 * 検証済みのCSVアニメーション名をFighterAction型へ変換する。
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
    "crouchBlock",
    "ko",
  ];

  return known.includes(value as FighterAction)
    ? (value as FighterAction)
    : "idle";
}

/** 検証済みのuse_stateを、技の使用可能状態へ変換する。 */
function toMoveUseState(value: string): MoveUseState {
  if (value === "air") return "air";
  if (value === "any") return "any";
  return "ground";
}

/** 検証済みのattack_levelを、上・中・下のガード属性へ変換する。 */
function toAttackLevel(value: string): AttackLevel {
  if (value === "high" || value === "上") return "high";
  if (value === "low" || value === "下") return "low";
  return "mid";
}

/**
 * moves.csv の cancel_into を、キャンセル開始できる攻撃ボタン種別へ変換する。
 * 複数指定は light|heavy|special|throw のように | で区切る。未知値は事前検証で拒否する。
 */
function toCancelInto(names: readonly string[]): readonly InputButton[] {
  return names.map((name) => buttonNames[name]);
}

/**
 * キャラクター定義CSVをCharacterDefinition配列へ変換する
 */
function parseCharacters(source: string): CharacterDefinition[] {
  return csvRecords(source, {
    fileName: "characters.csv",
    requiredHeaders: CHARACTER_HEADERS,
  }).map((row, index) => {
    const line = index + 2;
    const renderType = requiredText(row, "render_type", "characters.csv", line);
    if (renderType !== "stick" && renderType !== "blender") {
      dataError(
        "characters.csv",
        line,
        "render_type",
        "stick または blender を指定してください",
      );
    }
    if (renderType === "blender" && !row.animation_asset?.trim()) {
      dataError(
        "characters.csv",
        line,
        "animation_asset",
        "render_type=blender ではJSONパスが必要です",
      );
    }

    const hurtboxTop = dataNumber(row, "hurtbox_top", "characters.csv", line, {
      min: 1,
    });
    const hurtboxBottom = dataNumber(
      row,
      "hurtbox_bottom",
      "characters.csv",
      line,
      { min: 0 },
    );
    if (hurtboxBottom >= hurtboxTop) {
      dataError(
        "characters.csv",
        line,
        "hurtbox_bottom",
        "hurtbox_top より小さくしてください",
      );
    }

    return {
      id: dataId(row, "id", "characters.csv", line, { forbidAll: true }),
      name: requiredText(row, "name", "characters.csv", line),
      renderType,
      animationAsset: row.animation_asset?.trim() ?? "",
      iconAsset: row.icon_asset?.trim() ?? "",
      colorVariant: "default",
      primaryColor: dataColor(row, "primary_color", "characters.csv", line),
      accentColor: dataColor(row, "accent_color", "characters.csv", line),
      maxHealth: dataNumber(row, "max_health", "characters.csv", line, {
        integer: true,
        min: 1,
      }),
      walkSpeed: dataNumber(row, "walk_speed", "characters.csv", line, {
        min: 1,
      }),
      jumpVelocity: dataNumber(row, "jump_velocity", "characters.csv", line, {
        min: 1,
      }),
      hurtboxWidth: dataNumber(row, "hurtbox_width", "characters.csv", line, {
        min: 1,
      }),
      hurtboxTop,
      hurtboxBottom,
    } satisfies CharacterDefinition;
  });
}

/**
 * 技データCSVをMoveDefinition配列へ変換する
 */
function parseMoves(source: string): MoveDefinition[] {
  return csvRecords(source, {
    fileName: "moves.csv",
    requiredHeaders: MOVE_HEADERS,
  }).map((row, index) => {
    const line = index + 2;
    const characterId = dataId(row, "character_id", "moves.csv", line);
    const moveId = dataId(row, "move_id", "moves.csv", line);
    const buttonName = requiredText(
      row,
      "button",
      "moves.csv",
      line,
    ).toLowerCase();
    const button = buttonNames[buttonName];
    if (button === undefined) {
      dataError(
        "moves.csv",
        line,
        "button",
        "light / heavy / special / throw のいずれかを指定してください",
      );
    }
    const animationName = requiredText(row, "animation", "moves.csv", line);
    const knownAnimations: readonly FighterAction[] = [
      "idle",
      "walk",
      "jump",
      "light",
      "heavy",
      "special",
      "hit",
      "block",
      "crouchBlock",
      "ko",
    ];
    if (!knownAnimations.includes(animationName as FighterAction)) {
      dataError(
        "moves.csv",
        line,
        "animation",
        `未対応の値です (${animationName})`,
      );
    }
    const useState = requiredText(row, "use_state", "moves.csv", line);
    if (useState !== "ground" && useState !== "air" && useState !== "any") {
      dataError(
        "moves.csv",
        line,
        "use_state",
        "ground / air / any のいずれかを指定してください",
      );
    }
    const attackLevel = requiredText(row, "attack_level", "moves.csv", line);
    if (!["high", "mid", "low", "上", "中", "下"].includes(attackLevel)) {
      dataError(
        "moves.csv",
        line,
        "attack_level",
        "high / mid / low のいずれかを指定してください",
      );
    }
    const attackType = requiredText(row, "attack_type", "moves.csv", line);
    if (attackType !== "melee" && attackType !== "projectile") {
      dataError(
        "moves.csv",
        line,
        "attack_type",
        "melee または projectile を指定してください",
      );
    }
    const guardBleak = requiredText(
      row,
      "guard_bleak",
      "moves.csv",
      line,
    ).toLowerCase();
    if (guardBleak !== "true" && guardBleak !== "false") {
      dataError(
        "moves.csv",
        line,
        "guard_bleak",
        "true または false を指定してください",
      );
    }
    const cancelNames = optionalList(row, "cancel_into", "moves.csv", line).map(
      (name) => name.toLowerCase(),
    );
    if (new Set(cancelNames).size !== cancelNames.length) {
      dataError(
        "moves.csv",
        line,
        "cancel_into",
        "同じ攻撃種別を重複して指定できません",
      );
    }
    const invalidCancel = cancelNames.find(
      (name) => buttonNames[name] === undefined,
    );
    if (invalidCancel) {
      dataError(
        "moves.csv",
        line,
        "cancel_into",
        `未対応の攻撃種別です (${invalidCancel})`,
      );
    }
    const commandIds = optionalList(row, "command_id", "moves.csv", line);
    for (const commandId of commandIds) {
      if (!DATA_ID_PATTERN.test(commandId)) {
        dataError(
          "moves.csv",
          line,
          "command_id",
          `不正なIDです (${commandId})`,
        );
      }
    }

    const startup = dataNumber(row, "startup", "moves.csv", line, {
      integer: true,
      min: 0,
    });
    const active = dataNumber(row, "active", "moves.csv", line, {
      integer: true,
      min: 1,
    });
    const recovery = dataNumber(row, "recovery", "moves.csv", line, {
      integer: true,
      min: 0,
    });
    const invincibleFrames = dataNumber(
      row,
      "invincible_frames",
      "moves.csv",
      line,
      { integer: true, min: 0 },
    );
    if (invincibleFrames > startup + active + recovery) {
      dataError(
        "moves.csv",
        line,
        "invincible_frames",
        "startup + active + recovery 以下にしてください",
      );
    }
    const projectileSpeed = dataNumber(
      row,
      "projectile_speed",
      "moves.csv",
      line,
      { min: 0 },
    );
    const projectileLifetime = dataNumber(
      row,
      "projectile_lifetime",
      "moves.csv",
      line,
      { integer: true, min: 0 },
    );
    if (attackType === "projectile" && projectileSpeed <= 0) {
      dataError(
        "moves.csv",
        line,
        "projectile_speed",
        "projectileでは0より大きい値が必要です",
      );
    }
    if (attackType === "projectile" && projectileLifetime <= 0) {
      dataError(
        "moves.csv",
        line,
        "projectile_lifetime",
        "projectileでは1以上のフレーム数が必要です",
      );
    }

    return {
      characterId,
      id: moveId,
      button,
      startup,
      active,
      recovery,
      invincibleFrames,
      damage: dataNumber(row, "damage", "moves.csv", line, {
        integer: true,
        min: 0,
      }),
      specialGaugeCost: dataNumber(
        row,
        "special_gauge_cost",
        "moves.csv",
        line,
        {
          integer: true,
          min: 0,
          max: FIGHTING_GAME_CONFIG.match.gauges.specialMax,
        },
      ),
      superGaugeGain: dataNumber(row, "super_gauge_gain", "moves.csv", line, {
        integer: true,
        min: 0,
        max: FIGHTING_GAME_CONFIG.match.gauges.superMax,
      }),
      guardPiercing: guardBleak === "true",
      starterProration: dataNumber(
        row,
        "starter_proration",
        "moves.csv",
        line,
        { integer: true },
      ),
      cancelInto: toCancelInto(cancelNames),
      rangeX: dataNumber(row, "range_x", "moves.csv", line, { min: 0 }),
      rangeY: dataNumber(row, "range_y", "moves.csv", line, { min: 0 }),
      selfMoveX: dataNumber(row, "self_move_x", "moves.csv", line),
      selfMoveY: dataNumber(row, "self_move_y", "moves.csv", line),
      knockbackX: dataNumber(row, "knockback_x", "moves.csv", line, {
        min: 0,
      }),
      knockbackY: dataNumber(row, "knockback_y", "moves.csv", line, {
        min: 0,
      }),
      guardKnockbackX: dataNumber(row, "guard_knockback_x", "moves.csv", line, {
        min: 0,
      }),
      guardSelfKnockbackX: dataNumber(
        row,
        "guard_self_knockback_x",
        "moves.csv",
        line,
        { min: 0 },
      ),
      hitstun: dataNumber(row, "hitstun", "moves.csv", line, {
        integer: true,
        min: 0,
      }),
      guardStun: dataNumber(row, "guard_stun", "moves.csv", line, {
        integer: true,
        min: 0,
      }),
      animation: toAction(animationName),
      useState: toMoveUseState(useState),
      attackLevel: toAttackLevel(attackLevel),
      attackType,
      projectileSpeed,
      projectileLifetime,
      projectileId: row.projectile_id?.trim() || null,
      commandIds,
    } satisfies MoveDefinition;
  });
}

/** projectiles.csvを飛び道具の見た目定義へ変換する。 */
function parseProjectileDefinitions(source: string): ProjectileDefinition[] {
  return csvRecords(source, {
    fileName: "projectiles.csv",
    requiredHeaders: PROJECTILE_HEADERS,
  }).map((row, index) => {
    const line = index + 2;
    const renderType = requiredText(
      row,
      "render_type",
      "projectiles.csv",
      line,
    );
    if (renderType !== "circle" && renderType !== "sprite") {
      dataError(
        "projectiles.csv",
        line,
        "render_type",
        "circle または sprite を指定してください",
      );
    }
    if (renderType === "sprite" && !row.asset?.trim()) {
      dataError(
        "projectiles.csv",
        line,
        "asset",
        "render_type=sprite ではPNGパスが必要です",
      );
    }
    return {
      id: dataId(row, "id", "projectiles.csv", line),
      renderType,
      asset: row.asset?.trim() ?? "",
      width: dataNumber(row, "width", "projectiles.csv", line, {
        min: renderType === "sprite" ? 1 : 0,
      }),
      height: dataNumber(row, "height", "projectiles.csv", line, {
        min: renderType === "sprite" ? 1 : 0,
      }),
      // 旧CSVに列がない場合は、従来と同じ共通半径を使って後方互換を保つ。
      hitboxRadius: row.hitbox_radius?.trim()
        ? dataNumber(row, "hitbox_radius", "projectiles.csv", line, { min: 1 })
        : FIGHTING_GAME_CONFIG.match.combat.projectileHitboxRadius,
      outerRadius: dataNumber(row, "outer_radius", "projectiles.csv", line, {
        min: renderType === "circle" ? 1 : 0,
      }),
      middleRadius: dataNumber(row, "middle_radius", "projectiles.csv", line, {
        min: renderType === "circle" ? 1 : 0,
      }),
      coreRadius: dataNumber(row, "core_radius", "projectiles.csv", line, {
        min: renderType === "circle" ? 1 : 0,
      }),
      outerColor: dataColor(row, "outer_color", "projectiles.csv", line),
      middleColor: dataColor(row, "middle_color", "projectiles.csv", line),
      coreColor: dataColor(row, "core_color", "projectiles.csv", line),
    } satisfies ProjectileDefinition;
  });
}

/** commands.csv をゲーム内で使う方向コマンド定義へ変換する。 */
function parseCommands(source: string): CommandDefinition[] {
  return csvRecords(source, {
    fileName: "commands.csv",
    requiredHeaders: COMMAND_HEADERS,
  }).map((row, index) => {
    const line = index + 2;
    const id = dataId(row, "command_id", "commands.csv", line);
    const sequenceSource = requiredText(row, "sequence", "commands.csv", line);
    const sequence = sequenceSource
      .split(">")
      .map((token) => token.trim().toLowerCase());
    if (sequence.some((token) => token.length === 0)) {
      dataError(
        "commands.csv",
        line,
        "sequence",
        ">の間に空の方向を指定できません",
      );
    }
    const invalidDirection = sequence.find(
      (token) => !commandDirections.has(token as CommandDirection),
    );
    const maxFrames = dataNumber(row, "max_frames", "commands.csv", line, {
      integer: true,
      min: 0,
    });
    const priority = dataNumber(row, "priority", "commands.csv", line, {
      integer: true,
      min: 0,
      max: 100,
    });
    const chargeFrames = dataNumber(
      row,
      "charge_frames",
      "commands.csv",
      line,
      { integer: true, min: 0 },
    );

    if (invalidDirection) {
      dataError(
        "commands.csv",
        line,
        "sequence",
        `未対応の方向です (${invalidDirection})`,
      );
    }
    // 溜めコマンドでは、先頭の4を維持する時間をmax_framesへ含めない。
    const minimumCommandFrames =
      chargeFrames > 0
        ? Math.max(0, sequence.length - 2)
        : Math.max(0, sequence.length - 1);
    if (!Number.isInteger(maxFrames) || maxFrames < minimumCommandFrames) {
      throw new Error(
        `commands.csv の ${id} の max_frames は入力間隔を満たす整数にしてください`,
      );
    }
    if (chargeFrames > 0 && (sequence.length < 2 || sequence[0] !== "4")) {
      throw new Error(
        "commands.csv の " +
          id +
          " の溜めコマンドは sequence の先頭を4にしてください",
      );
    }
    return {
      id,
      sequence: sequence as CommandDirection[],
      maxFrames,
      priority,
      chargeFrames,
    };
  });
}

/** JSON値が配列以外のオブジェクトかを確認する。 */
function isDataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Blender JSONの必須構造を検証し、0F再生や不正座標による描画破損を防ぐ。 */
function validateBlenderAnimationData(
  value: unknown,
  characterName: string,
): asserts value is BlenderAnimationData {
  const fail = (message: string): never => {
    throw new Error(`${characterName} のBlenderアニメーションJSON: ${message}`);
  };
  if (!isDataRecord(value)) fail("ルートをオブジェクトにしてください");
  const root = value as Record<string, unknown>;
  const supportedFormats = new Set([
    "fightinggame2d-blender-bones-v1",
    "fightinggame2d-blender-sprite-v1",
  ]);
  if (typeof root.format !== "string" || !supportedFormats.has(root.format)) {
    fail("format は対応済みのbones-v1またはsprite-v1にしてください");
  }
  if (
    typeof root.fps !== "number" ||
    !Number.isFinite(root.fps) ||
    root.fps <= 0
  ) {
    fail("fps は0より大きい数値にしてください");
  }
  if (!isDataRecord(root.animations)) {
    fail("animations をオブジェクトにしてください");
  }
  for (const [action, frames] of Object.entries(
    root.animations as Record<string, unknown>,
  )) {
    if (!Array.isArray(frames))
      fail(`animations.${action} は配列にしてください`);
    for (const frame of frames as unknown[]) {
      if (!isDataRecord(frame) || !Array.isArray(frame.segments)) {
        fail(`animations.${action} の各要素にsegments配列が必要です`);
      }
      const frameRecord = frame as Record<string, unknown>;
      for (const segment of frameRecord.segments as unknown[]) {
        if (
          !Array.isArray(segment) ||
          segment.length < 4 ||
          segment.length > 5 ||
          segment.some(
            (coordinate) =>
              typeof coordinate !== "number" || !Number.isFinite(coordinate),
          ) ||
          (segment.length === 5 && (segment[4] as number) <= 0)
        ) {
          fail(`animations.${action} のsegmentsに不正な座標・線幅があります`);
        }
      }
    }
  }
  if (root.sprite === undefined) return;
  if (!isDataRecord(root.sprite)) fail("sprite をオブジェクトにしてください");
  const sprite = root.sprite as Record<string, unknown>;
  if (typeof sprite.asset !== "string" || !sprite.asset.trim()) {
    fail("sprite.asset に画像パスを指定してください");
  }
  if (
    typeof sprite.scale !== "number" ||
    !Number.isFinite(sprite.scale) ||
    sprite.scale <= 0
  ) {
    fail("sprite.scale は0より大きい数値にしてください");
  }
  if (
    !Array.isArray(sprite.anchor) ||
    sprite.anchor.length !== 2 ||
    sprite.anchor.some(
      (coordinate: unknown) =>
        typeof coordinate !== "number" ||
        !Number.isFinite(coordinate) ||
        coordinate < 0 ||
        coordinate > 1,
    )
  ) {
    fail("sprite.anchor は0〜1の数値2個で指定してください");
  }
  if (
    typeof sprite.frameDuration !== "number" ||
    !Number.isInteger(sprite.frameDuration) ||
    sprite.frameDuration <= 0
  ) {
    fail("sprite.frameDuration は1以上の整数にしてください");
  }
  if (
    sprite.nameplateY !== undefined &&
    (typeof sprite.nameplateY !== "number" ||
      !Number.isFinite(sprite.nameplateY))
  ) {
    fail("sprite.nameplateY は有限の数値にしてください");
  }
  if (!isDataRecord(sprite.animations)) {
    fail("sprite.animations をオブジェクトにしてください");
  }
  for (const [action, poses] of Object.entries(
    sprite.animations as Record<string, unknown>,
  )) {
    if (!Array.isArray(poses))
      fail(`sprite.animations.${action} は配列にしてください`);
    for (const pose of poses as unknown[]) {
      if (!isDataRecord(pose)) {
        fail(
          `sprite.animations.${action} の各ポーズはオブジェクトにしてください`,
        );
      }
      const poseRecord = pose as Record<string, unknown>;
      for (const property of ["x", "y", "rotation", "scale"] as const) {
        const coordinate = poseRecord[property];
        if (
          coordinate !== undefined &&
          (typeof coordinate !== "number" || !Number.isFinite(coordinate))
        ) {
          fail(
            `sprite.animations.${action}.${property} は有限の数値にしてください`,
          );
        }
        if (
          property === "scale" &&
          typeof coordinate === "number" &&
          coordinate <= 0
        ) {
          fail(
            `sprite.animations.${action}.scale は0より大きい数値にしてください`,
          );
        }
      }
    }
  }
}

/** 選択されたBlenderキャラクターだけJSON・PNGを読み、失敗時は棒人間へ戻す。 */
export async function loadCharacterAnimation(
  character: CharacterDefinition,
): Promise<BlenderAnimationData | undefined> {
  if (character.renderType !== "blender" || !character.animationAsset) {
    return undefined;
  }
  try {
    const response = await fetch(gameAssetUrl(character.animationAsset));
    if (!response.ok) {
      throw new Error(
        `${character.animationAsset} の読み込みに失敗しました (${response.status})`,
      );
    }
    const animation: unknown = await response.json();
    validateBlenderAnimationData(animation, character.name);
    if (animation.sprite?.asset) {
      await Assets.load(gameAssetUrl(animation.sprite.asset));
    }
    return animation;
  } catch (error) {
    console.warn(
      `${error instanceof Error ? error.message : String(error)}。${character.name} は棒人間で描画します`,
    );
    return undefined;
  }
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
    if (move.characterId !== "all" && !characterIds.has(move.characterId)) {
      throw new Error(
        `moves.csv の ${move.id} が未定義の character_id (${move.characterId}) を参照しています`,
      );
    }
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

  // 明示したCPU必殺技IDの綴り違いを、別技への暗黙フォールバック前に検出する。
  for (const [characterId, settings] of Object.entries(
    FIGHTING_GAME_CONFIG.cpu.characters,
  )) {
    if (characterId === "default") continue;
    if (!characterIds.has(characterId)) {
      throw new Error(
        `gameConfig.ts の cpu.characters.${characterId} は未定義キャラクターです`,
      );
    }
    if (!settings.specialMoveId) continue;
    const configuredMove =
      moves.find(
        (move) =>
          move.characterId === characterId &&
          move.id === settings.specialMoveId,
      ) ??
      moves.find(
        (move) =>
          move.characterId === "all" && move.id === settings.specialMoveId,
      );
    if (
      !configuredMove ||
      configuredMove.commandIds.length === 0 ||
      (configuredMove.useState !== "ground" &&
        configuredMove.useState !== "any")
    ) {
      throw new Error(
        `gameConfig.ts の cpu.characters.${characterId}.specialMoveId (${settings.specialMoveId}) は地上で使えるコマンド技を指定してください`,
      );
    }
  }

  // 全ゲームデータを返す
  return {
    characters,
    moves,
    commands,
    projectileDefinitions,
    // 重いJSON・PNGは選択後にloadCharacterAnimationで必要分だけ読み込む。
    blenderAnimations: {},
  };
}
