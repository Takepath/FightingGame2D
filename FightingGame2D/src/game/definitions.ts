import { csvRecords } from "./csv";
import {
  type BlenderAnimationData,
  type CharacterDefinition,
  type FighterAction,
  type GameData,
  InputButton,
  type MoveDefinition,
} from "./types";

const buttonNames: Record<string, InputButton> = {
  light: InputButton.Light,
  heavy: InputButton.Heavy,
  special: InputButton.Special,
};

function gameUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

async function loadText(path: string): Promise<string> {
  const response = await fetch(gameUrl(path));
  if (!response.ok)
    throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
  return response.text();
}

function toColor(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

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

function parseCharacters(source: string): CharacterDefinition[] {
  return csvRecords(source).map((row) => ({
    id: row.id,
    name: row.name,
    renderType: row.render_type === "blender" ? "blender" : "stick",
    animationAsset: row.animation_asset,
    primaryColor: toColor(row.primary_color),
    accentColor: toColor(row.accent_color),
    maxHealth: Number(row.max_health),
    walkSpeed: Number(row.walk_speed),
    jumpVelocity: Number(row.jump_velocity),
  }));
}

function parseMoves(source: string): MoveDefinition[] {
  return csvRecords(source).map((row) => ({
    characterId: row.character_id || "all",
    id: row.move_id,
    button: buttonNames[row.button.toLowerCase()] ?? InputButton.Light,
    startup: Number(row.startup),
    active: Number(row.active),
    recovery: Number(row.recovery),
    damage: Number(row.damage),
    rangeX: Number(row.range_x),
    rangeY: Number(row.range_y),
    knockbackX: Number(row.knockback_x),
    knockbackY: Number(row.knockback_y),
    hitstun: Number(row.hitstun),
    animation: toAction(row.animation),
    attackType: row.attack_type === "projectile" ? "projectile" : "melee",
    projectileSpeed: Number(row.projectile_speed) || 0,
    projectileLifetime: Number(row.projectile_lifetime) || 0,
  }));
}

export async function loadGameData(): Promise<GameData> {
  const [characterCsv, moveCsv] = await Promise.all([
    loadText("data/characters.csv"),
    loadText("data/moves.csv"),
  ]);
  const characters = parseCharacters(characterCsv);
  const moves = parseMoves(moveCsv);
  const blenderAnimations: Record<string, BlenderAnimationData> = {};

  await Promise.all(
    characters
      .filter(
        (character) =>
          character.renderType === "blender" && character.animationAsset,
      )
      .map(async (character) => {
        const response = await fetch(gameUrl(character.animationAsset));
        if (!response.ok) {
          // A missing optional animation must not stop a match; FighterView renders a stick figure.
          console.warn(
            `${character.name} のBlenderアニメーションを読み込めないため棒人間で描画します`,
          );
          return;
        }
        blenderAnimations[character.id] =
          (await response.json()) as BlenderAnimationData;
      }),
  );

  if (characters.length < 2) {
    throw new Error(
      "characters.csv には2人以上のキャラクターを定義してください",
    );
  }
  return { characters, moves, blenderAnimations };
}
