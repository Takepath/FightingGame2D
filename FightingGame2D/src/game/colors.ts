import type { CharacterDefinition, ColorVariant } from "./types";
import { FIGHTING_GAME_CONFIG } from "./gameConfig";

/** カラー選択画面に表示する1種類の色設定。 */
export interface ColorOption {
  readonly id: ColorVariant;
  readonly label: string;
  readonly primaryColor: number;
  readonly accentColor: number;
}

/** カラーの自動ずらしにも使う、選択肢の固定順序。 */
export const COLOR_VARIANTS: readonly ColorVariant[] =
  FIGHTING_GAME_CONFIG.colorSelect.order;

/** CSVのキャラクター色以外で使う共通カラーパレット。 */
const FIXED_COLOR_OPTIONS = FIGHTING_GAME_CONFIG.colorSelect.palette;

/** 指定キャラクターで選べる5色を、表示に必要な色値とラベルへ解決する。 */
export function colorOptionsFor(
  character: CharacterDefinition,
): readonly ColorOption[] {
  return COLOR_VARIANTS.map((id) => {
    if (id === "default") {
      return {
        id,
        label: "デフォルト",
        primaryColor: character.primaryColor,
        accentColor: character.accentColor,
      };
    }
    return { id, ...FIXED_COLOR_OPTIONS[id] };
  });
}

/** 選択カラーを適用した対戦用のキャラクター定義を返す。 */
export function characterWithColor(
  character: CharacterDefinition,
  color: ColorVariant,
): CharacterDefinition {
  if (color === "default") {
    return { ...character, colorVariant: "default" };
  }

  const option = FIXED_COLOR_OPTIONS[color];
  return {
    ...character,
    colorVariant: color,
    primaryColor: option.primaryColor,
    accentColor: option.accentColor,
  };
}

/** 同キャラ同色を避けるため、選択順で次の色を返す。 */
export function nextColorVariant(color: ColorVariant): ColorVariant {
  const index = COLOR_VARIANTS.indexOf(color);
  return COLOR_VARIANTS[(index + 1) % COLOR_VARIANTS.length];
}
