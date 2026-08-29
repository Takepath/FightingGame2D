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

/** 方向入力として扱う4方向のビットをまとめたマスク。 */
const DIRECTION_BUTTON_MASK =
  InputButton.Left | InputButton.Right | InputButton.Up | InputButton.Down;

export interface FrameInput {
  readonly buttons: number;
}

/**
 * 相反する方向が同時に押された入力を、方向入力全体のニュートラルへ正規化する。
 *
 * 左右または上下のどちらか一方でも相反すると、残っている方向（例: 左+下+右の下）も
 * 無効にする。攻撃ボタンは保持するため、方向ニュートラル中の攻撃入力は通常どおり扱える。
 */
export function normalizeDirectionalButtons(buttons: number): number {
  const horizontalConflict =
    (buttons & (InputButton.Left | InputButton.Right)) ===
    (InputButton.Left | InputButton.Right);
  const verticalConflict =
    (buttons & (InputButton.Up | InputButton.Down)) ===
    (InputButton.Up | InputButton.Down);
  return horizontalConflict || verticalConflict
    ? buttons & ~DIRECTION_BUTTON_MASK
    : buttons;
}

/**
 * 外部入力・CPU入力・通信入力を共通の方向入力規則へそろえる。
 * 変更がない場合は元のオブジェクトを返し、固定フレームごとの不要な生成を避ける。
 */
export function normalizeFrameInput(input: FrameInput): FrameInput {
  const buttons = normalizeDirectionalButtons(input.buttons);
  return buttons === input.buttons ? input : { buttons };
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
  | "cinematic"
  | "down"
  | "ko";

/** 技を出せる状態。any は地上・空中のどちらでも使用できる。 */
export type MoveUseState = "ground" | "air" | "any";

/** 攻撃のガード属性。highは立ち、lowはしゃがみ、midは両方でガードできる。 */
export type AttackLevel = "high" | "mid" | "low";

/** 自キャラ移動中の速度変化。arcは開始・終了時を遅くする山なりの変化。 */
export type SelfMoveEasing = "linear" | "accelerate" | "decelerate" | "arc";

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
  /**
   * 通常コマンドでは最初の方向入力から、溜めコマンドでは後続方向入力から
   * 攻撃ボタンまでに許容する固定フレーム数。
   */
  maxFrames: number;
  /** 同じ攻撃ボタンで複数コマンドが成立した時に優先する値。大きいほど優先。 */
  priority: number;
  /**
   * 先頭の後ろ入力を維持する必要があるフレーム数。
   * 前方向を含まない入力途切れは、ゲーム側で合計4Fまで許容する。
   * 0は通常コマンド、1以上は溜めコマンドとして扱う。
   */
  chargeFrames: number;
}

export interface MoveDefinition {
  characterId: string;
  id: string;
  button: InputButton;
  startup: number;
  active: number;
  recovery: number;
  /** 技開始時に背景を暗転させる演出フレーム数。0なら暗転演出を行わない。 */
  blackoutFrames: number;
  /** 技開始からこのフレーム数の間、投げを含む全ての攻撃を受けない。 */
  invincibleFrames: number;
  /** HPと同じ実数ポイントで扱うダメージ量。例: 500 は 500 HP のダメージ。 */
  damage: number;
  /** 最大100の必殺技ゲージから、技開始時に消費する量。0なら消費しない。 */
  specialGaugeCost: number;
  /** 最大300の超必殺ゲージから、技開始時に消費する量。0なら消費しない。 */
  superGaugeCost: number;
  /** 超必殺ゲージ消費技だけに適用する、コンボ補正後ダメージの実数値下限。0なら通常どおり。 */
  superComboMinimumDamage: number;
  /** 最大300の超必殺ゲージへ、ガードされず命中した時に加算する量。0なら増えない。 */
  superGaugeGain: number;
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
  /** 自キャラ移動の横方向。selfMoveYとの比率で進行方向を決める。 */
  selfMoveX: number;
  /** 自キャラ移動の縦方向。正値は上方向、selfMoveXとの比率で進行方向を決める。 */
  selfMoveY: number;
  /** 自キャラ移動の基準速度（ピクセル/秒）。0なら自キャラ移動をしない。 */
  selfMoveSpeed: number;
  /** startup終了後の自キャラ移動へ適用する速度変化。 */
  selfMoveEasing: SelfMoveEasing;
  knockbackX: number;
  knockbackY: number;
  /** ガードした相手を後方へ押す横方向の速度。 */
  guardKnockbackX: number;
  /** ガードされた攻撃側を後方へ押す横方向の速度。 */
  guardSelfKnockbackX: number;
  hitstun: number;
  /** 接地後にダウン状態として過ごすフレーム数。0なら通常の被弾復帰を行う。 */
  downFrames: number;
  /** ガード成功側が入力を受け付けないフレーム数。0なら硬直なし。 */
  guardStun: number;
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
  /** render_type=sprite の時に使用する右向き基準のPNGファイル。 */
  asset: string;
  /** スプライト描画時の幅。円形描画では使用しない。 */
  width: number;
  /** スプライト描画時の高さ。円形描画では使用しない。 */
  height: number;
  /** 発射者中心（targetOpponent時は相手中心）から上へずらす表示位置。単位はピクセル。 */
  spawnOffsetY: number;
  /** trueなら、発射時点の相手位置を検索してその真上へ一度だけ生成する。 */
  targetOpponent: boolean;
  /** 飛び道具の生存時間中に適用する移動速度の変化。 */
  selfMoveEasing: SelfMoveEasing;
  /** 見た目と独立して設定する、命中判定の円半径。 */
  hitboxRadius: number;
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
  /** 状態別PNGがない時、JSONの1ポーズを表示する60FPS基準のフレーム数。 */
  frameDuration: number;
  /** 状態別PNGがない時に使う、アクションごとの補間済み単体画像ポーズ一覧。 */
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
  /**
   * public/data/characters/<character-id>/<state>/*.png から生成した状態別連番。
   * JSONには保存せず、存在しない・空の状態はspriteの単体PNGポーズへフォールバックする。
   */
  spriteFrames?: Partial<Record<FighterAction, readonly string[]>>;
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
