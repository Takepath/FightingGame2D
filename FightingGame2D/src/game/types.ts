/** 入力フレームを正確に再生できるよう、ボタンをビットフラグで表す。 */
export const enum InputButton {
  Left = 1 << 0,
  Right = 1 << 1,
  Up = 1 << 2,
  Down = 1 << 3,
  Light = 1 << 4,
  Heavy = 1 << 5,
  Special = 1 << 6,
}

export interface FrameInput {
  buttons: number;
}

export type PlayerId = 0 | 1;
export type FighterAction =
  | "idle"
  | "walk"
  | "jump"
  | "light"
  | "heavy"
  | "special"
  | "hit"
  | "block"
  | "crouchBlock"
  | "ko";

/** 技を出せる状態。any は地上・空中のどちらでも使用できる。 */
export type MoveUseState = "ground" | "air" | "any";

/** 攻撃のガード属性。highは立ち、lowはしゃがみ、midは両方でガードできる。 */
export type AttackLevel = "high" | "mid" | "low";

/** キャラクター選択後に指定するカラー種別。defaultはcharacters.csvの色を使う。 */
export type ColorVariant = "default" | "black" | "red" | "yellow" | "white";

/** コマンドCSVで使う、キャラクターの向きを基準にしたテンキー方向。 */
export type CommandDirection =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

/** commands.csv の1行に対応する、必殺技などの方向コマンド定義。 */
export interface CommandDefinition {
  id: string;
  /** 最後の攻撃ボタンを除く、方向入力の順序。 */
  sequence: readonly CommandDirection[];
  /** 最初の方向入力から攻撃ボタンまでに許容する固定フレーム数。 */
  maxFrames: number;
}

export interface MoveDefinition {
  characterId: string;
  id: string;
  button: InputButton;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** 攻撃者の前方へ伸びるリーチ（相手の胴体端を基準にしたピクセル）。 */
  rangeX: number;
  /** 攻撃中心から上下へ伸びる判定の余白（ピクセル）。 */
  rangeY: number;
  knockbackX: number;
  knockbackY: number;
  hitstun: number;
  animation: FighterAction;
  /** CSVの use_state から読み込む、技を実行できる状態。 */
  useState: MoveUseState;
  /** CSVの attack_level から読み込む上・中・下属性。 */
  attackLevel: AttackLevel;
  attackType: "melee" | "projectile";
  projectileSpeed: number;
  projectileLifetime: number;
  /** commands.csv の command_id。空文字なら攻撃ボタンだけで技を出す。 */
  commandId: string | null;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  /** 描画種別。blenderはBlender書き出しJSONに定義されたスプライトアニメーションを再生する。 */
  renderType: "blender" | "stick";
  /** Blender書き出しJSONの保存先。 */
  animationAsset: string;
  /** キャラクター選択カードに表示するPNG画像のパス。未指定時は既定アイコンを表示する。 */
  iconAsset: string;
  primaryColor: number;
  accentColor: number;
  maxHealth: number;
  walkSpeed: number;
  jumpVelocity: number;
  /** 被弾判定の横幅（ピクセル）。 */
  hurtboxWidth: number;
  /** 足元から頭側へ伸びる被弾判定の高さ（ピクセル）。 */
  hurtboxTop: number;
  /** 足元から上へ空ける、足先を除外する被弾判定の余白（ピクセル）。 */
  hurtboxBottom: number;
}

/** Blenderのボーン線分をサンプリングした、従来形式の1フレーム。 */
export interface BlenderAnimationFrame {
  /** [始点X, 始点Y, 終点X, 終点Y, 線幅] をファイター基準のピクセルで保持する。 */
  segments: number[][];
}

/** Blender出力スプライトに対する、1フレーム分の位置・回転・拡縮補正。 */
export interface BlenderSpritePose {
  /** 基準位置からの横方向補正（ピクセル）。 */
  x?: number;
  /** 基準位置からの縦方向補正（ピクセル）。 */
  y?: number;
  /** 回転角度（ラジアン）。 */
  rotation?: number;
  /** 基準倍率に対する拡縮倍率。 */
  scale?: number;
}

/** Blender由来のキャラクター画像と、アクション別の再生ポーズをまとめた定義。 */
export interface BlenderSpriteAnimation {
  /** 透過PNGなど、キャラクターの見た目に使う画像ファイル。 */
  asset: string;
  /** 元画像に適用する表示倍率。 */
  scale: number;
  /** 画像を足元に合わせるためのアンカー座標（0〜1）。 */
  anchor: readonly [number, number];
  /** キャラクター名を表示する足元基準のY座標（ピクセル）。 */
  nameplateY?: number;
  /** 1つのポーズを表示する60FPS基準のフレーム数。 */
  frameDuration: number;
  /** アクションごとの補間済みポーズ一覧。 */
  animations: Partial<Record<FighterAction, readonly BlenderSpritePose[]>>;
}

/** Blenderから書き出したアニメーションデータ。スプライト形式と骨格線分形式の両方を扱う。 */
export interface BlenderAnimationData {
  format: string;
  fps: number;
  /** 従来のボーン線分形式。スプライト形式だけの場合は空オブジェクトにできる。 */
  animations: Record<string, BlenderAnimationFrame[]>;
  /** 画像ベースで再生するBlenderアニメーション定義。未指定時は棒人間へフォールバックする。 */
  sprite?: BlenderSpriteAnimation;
}

export interface GameData {
  characters: CharacterDefinition[];
  moves: MoveDefinition[];
  commands: CommandDefinition[];
  /** character.csvでblender指定されたキャラクターのアニメーションデータ。 */
  blenderAnimations: Record<string, BlenderAnimationData>;
}

export function pressed(input: FrameInput, button: InputButton): boolean {
  return (input.buttons & button) !== 0;
}
