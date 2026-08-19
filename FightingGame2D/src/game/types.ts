/** 入力フレームを正確に再生できるよう、ボタンをビットフラグで表す。 */
export const enum InputButton {
  Left = 1 << 0,
  Right = 1 << 1,
  Up = 1 << 2,
  Down = 1 << 3,
  Light = 1 << 4,
  Heavy = 1 << 5,
  Special = 1 << 6,
  Throw = 1 << 7,
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

/** 飛び道具の描画方式。circleはコード描画、spriteはPNG画像を使用する。 */
export type ProjectileRenderType = "circle" | "sprite";

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
  /** HPと同じ実数ポイントで扱うダメージ量。例: 500 は 500 HP のダメージ。 */
  damage: number;
  /** 最大100の必殺技ゲージから、技開始時に消費する量。0なら消費しない。 */
  specialGaugeCost: number;
  /** trueなら後ろ入力ガードを無視してダメージを与える。投げは必ずtrueにする。 */
  guardPiercing: boolean;
  /** コンボ始動時の補正率。20なら120%、-10なら90%を初期補正率にする。 */
  starterProration: number;
  /** この技の硬直をキャンセルして開始できる攻撃ボタン種別。moves.csvでは|区切りで指定する。 */
  cancelInto: readonly InputButton[];
  /** 攻撃者の前方へ伸びるリーチ（相手の胴体端を基準にしたピクセル）。 */
  rangeX: number;
  /** 攻撃中心から上下へ伸びる判定の余白（ピクセル）。 */
  rangeY: number;
  /** 技開始時に前方へ与える自分自身の移動速度（ピクセル/秒）。 */
  selfMoveX: number;
  /** 技開始時に上方向へ与える自分自身の移動速度（ピクセル/秒）。 */
  selfMoveY: number;
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
  /** projectiles.csv の id。近接技では未指定にする。 */
  projectileId: string | null;
  /** commands.csv の command_id群。moves.csvでは|区切りで指定し、空欄なら攻撃ボタンだけで技を出す。 */
  commandIds: readonly string[];
}

/** projectiles.csv で管理する飛び道具の見た目定義。 */
export interface ProjectileDefinition {
  id: string;
  renderType: ProjectileRenderType;
  /** render_type=sprite の時に使用するPNGファイル。 */
  asset: string;
  /** スプライト描画時の幅。円形描画では使用しない。 */
  width: number;
  /** スプライト描画時の高さ。円形描画では使用しない。 */
  height: number;
  /** 円形エフェクトの外側・中間・中心の半径。 */
  outerRadius: number;
  middleRadius: number;
  coreRadius: number;
  /** 円形エフェクトに使用する外側・中間・中心の色。 */
  outerColor: number;
  middleColor: number;
  coreColor: number;
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
  /** 対戦時に適用するカラー選択。Blenderスプライトの色オーバーレイにも使用する。 */
  colorVariant: ColorVariant;
  primaryColor: number;
  accentColor: number;
  /** 実数ポイントで扱う最大HP。moves.csv の damage と同じ単位を使用する。 */
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
  /** projectiles.csv から読み込む、飛び道具の見た目定義。 */
  projectileDefinitions: ProjectileDefinition[];
  /** character.csvでblender指定されたキャラクターのアニメーションデータ。 */
  blenderAnimations: Record<string, BlenderAnimationData>;
}

export function pressed(input: FrameInput, button: InputButton): boolean {
  return (input.buttons & button) !== 0;
}
