import type { FightingGameConfig } from "./gameConfig";
import type { GameData } from "./types";

/** オンライン決定論へ影響するデータだけを、順序を保ったJSONへ固定する。 */
function deterministicData(
  data: GameData,
  config: FightingGameConfig,
  stageIds: readonly string[],
): unknown {
  return {
    protocol: 1,
    fixedFps: config.engine.fixedFps,
    match: config.match,
    characters: data.characters.map((character) => ({
      id: character.id,
      maxHealth: character.maxHealth,
      walkSpeed: character.walkSpeed,
      jumpVelocity: character.jumpVelocity,
      hurtboxWidth: character.hurtboxWidth,
      hurtboxTop: character.hurtboxTop,
      hurtboxBottom: character.hurtboxBottom,
    })),
    moves: data.moves,
    commands: data.commands,
    projectileHitboxes: data.projectileDefinitions.map((projectile) => ({
      id: projectile.id,
      hitboxRadius: projectile.hitboxRadius,
    })),
    // オンラインではP1のステージを両者へ反映するため、背景ファイル一覧の不一致も開始前に検出する。
    stageIds,
  };
}

/**
 * キャッシュ違いを開始前に検出するための64bit FNV-1a指紋。
 * セキュリティ用途ではなく、CSV・設定・bundleの偶発的不一致検出に使用する。
 */
export function createDeterministicDataFingerprint(
  data: GameData,
  config: FightingGameConfig,
  stageIds: readonly string[] = [],
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(deterministicData(data, config, stageIds)),
  );
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}
