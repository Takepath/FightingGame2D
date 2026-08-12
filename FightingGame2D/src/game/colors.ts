import type { CharacterDefinition, ColorVariant } from "./types";

/** カラー選択画面に表示する1種類の色設定。 */
export interface ColorOption {
  readonly id: ColorVariant;
  readonly label: string;
  readonly primaryColor: number;
  readonly accentColor: number;
}

/** カラーの自動ずらしにも使う、選択肢の固定順序。 */
export const COLOR_VARIANTS: readonly ColorVariant[] = [
  "default",
  "black",
  "red",
  "yellow",
  "white",
];

/** CSVのキャラクター色以外で使う共通カラーパレット。 */
const FIXED_COLOR_OPTIONS: Readonly<
  Record<Exclude<ColorVariant, "default">, Omit<ColorOption, "id">>
> = {
  black: { label: "黒系", primaryColor: 0x1b2432, accentColor: 0x7d8ba1 },
  red: { label: "赤系", primaryColor: 0xcf354a, accentColor: 0xffb0b7 },
  yellow: { label: "黄色系", primaryColor: 0xe1b71b, accentColor: 0xfff1a2 },
  white: { label: "白系", primaryColor: 0xeaf0fa, accentColor: 0x788cae },
};

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
  if (color === "default") return character;

  const option = FIXED_COLOR_OPTIONS[color];
  return {
    ...character,
    primaryColor: option.primaryColor,
    accentColor: option.accentColor,
  };
}

/** 同キャラ同色を避けるため、選択順で次の色を返す。 */
export function nextColorVariant(color: ColorVariant): ColorVariant {
  const index = COLOR_VARIANTS.indexOf(color);
  return COLOR_VARIANTS[(index + 1) % COLOR_VARIANTS.length];
}
