import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import { gameAssetUrl } from "./assets";
import { FIGHTING_GAME_CONFIG } from "./gameConfig";
import { POSITION_SCALE, type FighterState } from "./simulation";
import type {
  BlenderAnimationData,
  BlenderSpriteAnimation,
  BlenderSpritePose,
} from "./types";

/** 画像解析で生成した、色替え用マスクと黒系カラー用の輪郭マスク。 */
interface SpriteColorAnalysis {
  readonly colorMask: HTMLCanvasElement;
  readonly whiteOutlineMask: HTMLCanvasElement;
  /** 縮小マスクを元画像と同じ表示寸法へ戻す倍率。 */
  readonly displayScale: number;
}

/** 同じPNGをP1・P2で重複解析しないための非同期解析キャッシュ。 */
const spriteColorAnalysisCache = new Map<
  string,
  Promise<SpriteColorAnalysis | null>
>();

/** 黒系カラーでも背景から判別できるようにする、元画像ピクセルでの輪郭幅。 */
const BLACK_OUTLINE_SOURCE_PIXELS = 8;

/** Canvas 2Dコンテキストを必ず取得する。 */
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("画像カラー解析用のCanvasを作成できませんでした");
  return context;
}

/** PNGを一度だけ解析し、色替え対象と白い外枠のアルファマスクを生成する。 */
async function analyzeSpriteColors(
  assetUrl: string,
): Promise<SpriteColorAnalysis | null> {
  try {
    const response = await fetch(assetUrl);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    try {
      // 色替え用Canvasは長辺上限まで縮小し、高解像度PNGによる常駐メモリを抑える。
      const displayScale = Math.max(
        1,
        Math.max(bitmap.width, bitmap.height) /
          FIGHTING_GAME_CONFIG.presentation.spriteColorMaskMaxDimension,
      );
      const source = document.createElement("canvas");
      source.width = Math.max(1, Math.round(bitmap.width / displayScale));
      source.height = Math.max(1, Math.round(bitmap.height / displayScale));
      const sourceContext = canvasContext(source);
      sourceContext.drawImage(bitmap, 0, 0, source.width, source.height);

      const sourcePixels = sourceContext.getImageData(
        0,
        0,
        source.width,
        source.height,
      );
      const colorMask = document.createElement("canvas");
      colorMask.width = source.width;
      colorMask.height = source.height;
      const colorContext = canvasContext(colorMask);
      const maskPixels = colorContext.createImageData(
        source.width,
        source.height,
      );

      // 黒い線と白い歯・目は残し、彩度を持つキャラクター部分だけを色替え対象にする。
      for (let index = 0; index < sourcePixels.data.length; index += 4) {
        const red = sourcePixels.data[index];
        const green = sourcePixels.data[index + 1];
        const blue = sourcePixels.data[index + 2];
        const alpha = sourcePixels.data[index + 3];
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const brightness = (red * 54 + green * 183 + blue * 19) >> 8;
        const chroma = maximum - minimum;

        if (
          alpha === 0 ||
          brightness < 40 ||
          (chroma < 20 && brightness > 210)
        ) {
          continue;
        }

        // 元画像の質感を残すため、彩度に応じてオーバーレイの不透明度を調整する。
        const overlayAlpha = Math.round(
          alpha * (0.52 + Math.min(0.3, chroma / 425)),
        );
        maskPixels.data[index] = 255;
        maskPixels.data[index + 1] = 255;
        maskPixels.data[index + 2] = 255;
        maskPixels.data[index + 3] = overlayAlpha;
      }
      colorContext.putImageData(maskPixels, 0, 0);

      // 元画像の不透明部分だけを白いシルエットにし、外側へ複数回ずらして輪郭を作る。
      const silhouette = document.createElement("canvas");
      silhouette.width = source.width;
      silhouette.height = source.height;
      const silhouetteContext = canvasContext(silhouette);
      silhouetteContext.drawImage(source, 0, 0);
      silhouetteContext.globalCompositeOperation = "source-in";
      silhouetteContext.fillStyle = "#ffffff";
      silhouetteContext.fillRect(0, 0, source.width, source.height);

      const whiteOutlineMask = document.createElement("canvas");
      whiteOutlineMask.width = source.width;
      whiteOutlineMask.height = source.height;
      const outlineContext = canvasContext(whiteOutlineMask);
      const outlinePixels = Math.max(
        1,
        Math.round(BLACK_OUTLINE_SOURCE_PIXELS / displayScale),
      );
      for (let step = 0; step < 16; step += 1) {
        const angle = (Math.PI * 2 * step) / 16;
        outlineContext.drawImage(
          silhouette,
          Math.round(Math.cos(angle) * outlinePixels),
          Math.round(Math.sin(angle) * outlinePixels),
        );
      }
      outlineContext.globalCompositeOperation = "destination-out";
      outlineContext.drawImage(silhouette, 0, 0);

      return { colorMask, whiteOutlineMask, displayScale };
    } finally {
      bitmap.close();
    }
  } catch {
    // 解析に失敗しても元のPNG表示を継続する。
    return null;
  }
}

/** URLごとに初回だけPNGを解析する。 */
function spriteColorAnalysisFor(
  assetUrl: string,
): Promise<SpriteColorAnalysis | null> {
  let analysis = spriteColorAnalysisCache.get(assetUrl);
  if (!analysis) {
    analysis = analyzeSpriteColors(assetUrl).then((result) => {
      // 一時的な通信・デコード失敗は固定キャッシュせず、次回選択で再試行可能にする。
      if (!result) spriteColorAnalysisCache.delete(assetUrl);
      return result;
    });
    spriteColorAnalysisCache.set(assetUrl, analysis);
  }
  return analysis;
}

/** VS画面中に色替えマスクを先行生成し、対戦開始後の色表示遅延を避ける。 */
export async function preloadSpriteColorAnalysis(
  animation: BlenderAnimationData | undefined,
): Promise<void> {
  const asset = animation?.sprite?.asset;
  if (!asset) return;
  await spriteColorAnalysisFor(gameAssetUrl(asset));
}

/**
 * ファイター表示クラス
 *
 * ・CSVで指定したキャラクターカラー
 * ・共通のスティックファイター表示
 * を描画するクラス
 */
export class FighterView extends Container {
  /** 地面に表示する影 */
  private readonly shadow = new Graphics();

  /** キャラクター本体 */
  private readonly body = new Graphics();

  /** キャラクター名表示 */
  private readonly nameplate: Text;

  /** Blender書き出しJSON。スプライト形式がない場合は棒人間描画を使う。 */
  private readonly animation?: BlenderAnimationData;

  /** Blenderアニメーションに連動して動かすキャラクタースプライト。 */
  private readonly animatedSprite?: Sprite;

  /** 画像解析で作った選択カラー用オーバーレイ。 */
  private readonly spriteColorOverlay?: Sprite;

  /** 黒系カラー時だけ表示する、PNGキャラクターの白い外枠。 */
  private readonly spriteWhiteOutline?: Sprite;

  /** 縮小した色替えマスクを元画像と同じ表示寸法へ戻す倍率。 */
  private spriteColorLayerScale = 1;

  /** 前回反映したファイター座標。変化時だけContainer座標を更新する。 */
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  /** 前回描画した見た目の状態。変わらないGraphics再生成を避ける。 */
  private lastVisualKey = "";

  public constructor(
    private readonly fighter: FighterState,
    animation?: BlenderAnimationData,
  ) {
    super();

    this.animation = animation;

    //====================================================
    // 名前表示生成
    //====================================================
    this.nameplate = new Text({
      text: fighter.character.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 15,
        fontWeight: "700",
        fill: "#f7fbff",
        stroke: {
          color: "#10131f",
          width: 4,
        },
      },
      anchor: 0.5,
    });

    // Blenderスプライトは先に生成し、読み込み済みテクスチャを描画に使う。
    const spriteDefinition = animation?.sprite;
    if (spriteDefinition) {
      const sprite = Sprite.from(gameAssetUrl(spriteDefinition.asset));
      sprite.anchor.set(spriteDefinition.anchor[0], spriteDefinition.anchor[1]);
      this.animatedSprite = sprite;

      const colorOverlay = new Sprite();
      colorOverlay.anchor.set(
        spriteDefinition.anchor[0],
        spriteDefinition.anchor[1],
      );
      colorOverlay.visible = false;
      this.spriteColorOverlay = colorOverlay;

      const whiteOutline = new Sprite();
      whiteOutline.anchor.set(
        spriteDefinition.anchor[0],
        spriteDefinition.anchor[1],
      );
      whiteOutline.visible = false;
      this.spriteWhiteOutline = whiteOutline;

      if (fighter.character.colorVariant !== "default") {
        // 色替え不要な既定色では、原寸PNGの全画素解析とマスク常駐を発生させない。
        void this.prepareSpriteColorLayers(
          gameAssetUrl(spriteDefinition.asset),
        );
      }
    }

    // 描画順
    // 影 → 白枠 → Blenderスプライト → カラーオーバーレイ → 本体エフェクト → 名前
    this.addChild(this.shadow);
    if (this.spriteWhiteOutline) this.addChild(this.spriteWhiteOutline);
    if (this.animatedSprite) this.addChild(this.animatedSprite);
    if (this.spriteColorOverlay) this.addChild(this.spriteColorOverlay);
    this.addChild(this.body, this.nameplate);

    // 地面の影と名前位置はキャラクター状態に依存しないため、初期化時だけ描画する。
    this.shadow.ellipse(0, 2, 52, 10).fill({
      color: 0x050711,
      alpha: 0.45,
    });
    // 背の高いスプライトは、頭部や相手の名前と重ならない高さへ個別に調整する。
    this.nameplate.position.set(0, spriteDefinition?.nameplateY ?? -184);
  }

  //====================================================
  // 毎フレーム更新
  //====================================================
  public update(): void {
    // キャラクター位置更新
    const x = this.fighter.x / POSITION_SCALE;
    const y = this.fighter.y / POSITION_SCALE;
    if (x !== this.lastX || y !== this.lastY) {
      this.position.set(x, y);
      this.lastX = x;
      this.lastY = y;
    }

    const visualKey = this.createVisualKey();
    if (visualKey === this.lastVisualKey) return;
    this.lastVisualKey = visualKey;

    //====================================================
    // 本体描画
    //====================================================
    this.body.clear();
    const spriteDefinition = this.animation?.sprite;
    if (this.animatedSprite && spriteDefinition) {
      // Blender JSONのポーズ値で、透過PNGスプライトをアニメーションする。
      this.body.scale.set(1);
      this.updateBlenderSprite(spriteDefinition);
    } else if (this.animation) {
      // 従来のBlenderボーン線分JSONは、書き出し済み骨格をそのまま再生する。
      this.body.scale.set(1, this.fighter.action === "crouchBlock" ? 0.72 : 1);
      this.drawBlenderPose();
    } else {
      // しゃがみガードは、足元基準で低く表示する。
      this.body.scale.set(1, this.fighter.action === "crouchBlock" ? 0.72 : 1);
      this.drawStickFigure();
    }

    //====================================================
    // スタン状態のエフェクト表示
    //====================================================
    if (this.fighter.stun > 0) {
      this.body.circle(0, -150, 7).fill({ color: 0xfff06a });

      this.body.circle(18, -140, 5).fill({ color: 0xfff06a });
    }
  }

  /** 描画に影響する状態だけをキー化し、変化のないGraphics再生成を抑止する。 */
  private createVisualKey(): string {
    const base = `${this.fighter.action}|${this.fighter.facing}|${Number(this.fighter.stun > 0)}`;
    const spriteDefinition = this.animation?.sprite;
    if (spriteDefinition) {
      return `${base}|${this.spritePoseFrameIndex(spriteDefinition)}`;
    }
    if (this.animation) {
      // 同じ骨格ポーズを表示する硬直中は、Graphicsを再テッセレーションしない。
      return `${base}|${this.blenderPoseFrameIndex() ?? "fallback"}`;
    }
    return this.fighter.action === "walk"
      ? `${base}|${this.fighter.actionFrame % 16}`
      : base;
  }

  /** 初回画像解析で作ったマスクをスプライトへ設定する。 */
  private async prepareSpriteColorLayers(assetUrl: string): Promise<void> {
    const analysis = await spriteColorAnalysisFor(assetUrl);
    if (!analysis || this.destroyed) return;

    const colorOverlay = this.spriteColorOverlay;
    const whiteOutline = this.spriteWhiteOutline;
    if (!colorOverlay || !whiteOutline) return;

    // 同じキャラクター同士では解析Canvas由来のTextureをPixiキャッシュで共有する。
    colorOverlay.texture = Texture.from(analysis.colorMask);
    colorOverlay.tint = this.fighter.character.primaryColor;
    colorOverlay.visible = this.fighter.character.colorVariant !== "default";

    whiteOutline.texture = Texture.from(analysis.whiteOutlineMask);
    whiteOutline.visible = this.usesWhiteOutline();
    this.spriteColorLayerScale = analysis.displayScale;

    // 非同期でレイヤーを追加した直後も、次回更新で現在のポーズへ同期する。
    this.lastVisualKey = "";
  }

  /** Blender出力に含まれる、現在アクション用のスプライトポーズを取得する。 */
  private spritePosesForCurrentAction(
    definition: BlenderSpriteAnimation,
  ): readonly BlenderSpritePose[] {
    if (this.fighter.action === "crouchBlock") {
      // 専用ポーズがあれば再生し、旧JSONだけ立ちガードへ後方互換フォールバックする。
      return (
        definition.animations.crouchBlock ??
        definition.animations.block ??
        definition.animations.idle ??
        []
      );
    }
    const action = this.fighter.action;
    return definition.animations[action] ?? definition.animations.idle ?? [];
  }

  /** Blender JSONのフレーム値をスプライトへ反映する。 */
  private updateBlenderSprite(definition: BlenderSpriteAnimation): void {
    const poses = this.spritePosesForCurrentAction(definition);
    const fallbackPose: BlenderSpritePose = {};
    const pose =
      poses.length === 0
        ? fallbackPose
        : poses[this.spritePoseFrameIndex(definition)];
    const mirror = this.fighter.facing;
    const scale = definition.scale * (pose.scale ?? 1);

    // 元PNG・色オーバーレイ・白枠を完全に同じ姿勢で動かし、ずれを防ぐ。
    if (this.animatedSprite) {
      this.animatedSprite.position.set((pose.x ?? 0) * mirror, pose.y ?? 0);
      this.animatedSprite.rotation = (pose.rotation ?? 0) * mirror;
      this.animatedSprite.scale.set(scale * mirror, scale);
    }
    for (const sprite of [this.spriteColorOverlay, this.spriteWhiteOutline]) {
      if (!sprite) continue;
      sprite.position.set((pose.x ?? 0) * mirror, pose.y ?? 0);
      sprite.rotation = (pose.rotation ?? 0) * mirror;
      sprite.scale.set(
        scale * mirror * this.spriteColorLayerScale,
        scale * this.spriteColorLayerScale,
      );
    }
  }

  /** 実際に表示するスプライトポーズ番号を返し、同一ポーズの再描画を避ける。 */
  private spritePoseFrameIndex(definition: BlenderSpriteAnimation): number {
    const poses = this.spritePosesForCurrentAction(definition);
    if (poses.length === 0) return 0;
    const frame = Math.floor(
      this.fighter.actionFrame / definition.frameDuration,
    );
    const looping =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block" ||
      this.fighter.action === "crouchBlock";
    return looping ? frame % poses.length : Math.min(frame, poses.length - 1);
  }

  /** 黒系カラーは背景へ溶け込まないよう、白い境界線を表示する。 */
  private usesWhiteOutline(): boolean {
    return this.fighter.character.colorVariant === "black";
  }

  /** 従来のBlenderボーン線分JSONを、Pixiの線分・関節として描画する。 */
  private drawBlenderPose(): void {
    const pose = this.sampleBlenderPose();
    if (!pose) {
      this.drawStickFigure();
      return;
    }

    const mirror = this.fighter.facing;
    for (const segment of pose.segments) {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, width = 8] = segment;

      if (this.usesWhiteOutline()) {
        this.body
          .moveTo(x1 * mirror, y1)
          .lineTo(x2 * mirror, y2)
          .stroke({ color: 0xffffff, width: width + 4, cap: "round" });
      }

      this.body
        .moveTo(x1 * mirror, y1)
        .lineTo(x2 * mirror, y2)
        .stroke({
          color: this.fighter.character.primaryColor,
          width,
          cap: "round",
        });

      // 関節描画
      if (this.usesWhiteOutline()) {
        this.body.circle(x2 * mirror, y2, Math.max(5, width * 0.42 + 2)).fill({
          color: 0xffffff,
        });
      }
      this.body.circle(x2 * mirror, y2, Math.max(3, width * 0.42)).fill({
        color: this.fighter.character.accentColor,
      });
    }

    // 骨格データに頭部がない場合でも、キャラクターの向きが分かる頭を重ねる。
    if (this.usesWhiteOutline()) {
      this.body.circle(0, -122, 19).fill({ color: 0xffffff });
    }
    this.body
      .circle(0, -122, 16)
      .fill({
        color: this.fighter.character.primaryColor,
      })
      .circle(-5 * mirror, -125, 3)
      .fill({
        color: 0xf7fbff,
      });
  }

  /** 現在のゲームアクションに対応するBlenderボーンフレームを取得する。 */
  private sampleBlenderPose() {
    const frames = this.blenderFramesForCurrentAction();
    if (!frames?.length) return undefined;
    const index = this.blenderPoseFrameIndex();
    return index === undefined ? undefined : frames[index];
  }

  /** 60FPSの経過フレームを、実際に表示するBlender骨格ポーズ番号へ変換する。 */
  private blenderPoseFrameIndex(): number | undefined {
    const frames = this.blenderFramesForCurrentAction();
    if (!frames?.length || !this.animation) return undefined;
    const animationFrame = Math.floor(
      (this.fighter.actionFrame * this.animation.fps) /
        FIGHTING_GAME_CONFIG.engine.fixedFps,
    );
    const looping =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block" ||
      this.fighter.action === "crouchBlock";
    return looping
      ? animationFrame % frames.length
      : Math.min(animationFrame, frames.length - 1);
  }

  /** しゃがみガード専用フレームを優先し、旧JSONだけblockへフォールバックする。 */
  private blenderFramesForCurrentAction() {
    const animations = this.animation?.animations;
    if (!animations) return undefined;

    if (this.fighter.action === "crouchBlock") {
      return animations.crouchBlock ?? animations.block ?? animations.idle;
    }
    const action = this.fighter.action;
    return animations[action] ?? animations.idle;
  }

  //====================================================
  // 簡易スティックファイター描画
  //====================================================
  private drawStickFigure(): void {
    const mirror = this.fighter.facing;

    // 歩行時の足振り
    const walkSwing =
      this.fighter.action === "walk"
        ? ((this.fighter.actionFrame % 16) - 8) * 2
        : 0;

    // 攻撃中判定
    const attacking =
      this.fighter.action === "light" ||
      this.fighter.action === "heavy" ||
      this.fighter.action === "special";

    // 攻撃時は腕を長くする
    const armReach = attacking ? 54 : 28;

    // ガード時は少し前傾
    const lean =
      this.fighter.action === "block" || this.fighter.action === "crouchBlock"
        ? -10
        : 0;

    const color = this.fighter.character.primaryColor;
    const accent = this.fighter.character.accentColor;

    //====================================================
    // 胴体・腕・脚・頭を描画
    //====================================================
    if (this.usesWhiteOutline()) {
      // 黒系スティックファイターも背景へ沈まないよう、各パーツの下に白い境界線を描く。
      this.body
        .moveTo(0, -82)
        .lineTo(lean * mirror, -40)
        .stroke({ color: 0xffffff, width: 16, cap: "round" })
        .moveTo(lean * mirror, -72)
        .lineTo((lean + armReach) * mirror, attacking ? -72 : -48)
        .stroke({ color: 0xffffff, width: 12, cap: "round" })
        .moveTo(lean * mirror, -72)
        .lineTo((lean - 30) * mirror, -48)
        .stroke({ color: 0xffffff, width: 12, cap: "round" })
        .moveTo(lean * mirror, -40)
        .lineTo((-21 + walkSwing) * mirror, 0)
        .stroke({ color: 0xffffff, width: 14, cap: "round" })
        .moveTo(lean * mirror, -40)
        .lineTo((22 - walkSwing) * mirror, 0)
        .stroke({ color: 0xffffff, width: 14, cap: "round" })
        .circle(0, -104, 23)
        .fill({ color: 0xffffff });
    }

    this.body
      .moveTo(0, -82)
      .lineTo(lean * mirror, -40)
      .stroke({
        color,
        width: 12,
        cap: "round",
      })

      .moveTo(lean * mirror, -72)
      .lineTo((lean + armReach) * mirror, attacking ? -72 : -48)
      .stroke({
        color: accent,
        width: 8,
        cap: "round",
      })

      .moveTo(lean * mirror, -72)
      .lineTo((lean - 30) * mirror, -48)
      .stroke({
        color,
        width: 8,
        cap: "round",
      })

      .moveTo(lean * mirror, -40)
      .lineTo((-21 + walkSwing) * mirror, 0)
      .stroke({
        color,
        width: 10,
        cap: "round",
      })

      .moveTo(lean * mirror, -40)
      .lineTo((22 - walkSwing) * mirror, 0)
      .stroke({
        color: accent,
        width: 10,
        cap: "round",
      })

      .circle(0, -104, 20)
      .fill({ color })

      .circle(6 * mirror, -106, 3)
      .fill({
        color: 0xffffff,
      });

    //====================================================
    // 必殺技エフェクト
    //====================================================
    if (this.fighter.action === "special") {
      this.body.circle(74 * mirror, -70, 18).fill({
        color: accent,
        alpha: 0.78,
      });
    }

    //====================================================
    // KO時は倒れる演出
    //====================================================
    if (this.fighter.action === "ko") {
      this.body.rotation = 1.15 * mirror;
    } else {
      this.body.rotation = 0;
    }
  }
}
