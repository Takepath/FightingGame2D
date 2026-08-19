import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

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
      const source = document.createElement("canvas");
      source.width = bitmap.width;
      source.height = bitmap.height;
      const sourceContext = canvasContext(source);
      sourceContext.drawImage(bitmap, 0, 0);

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
      for (let step = 0; step < 16; step += 1) {
        const angle = (Math.PI * 2 * step) / 16;
        outlineContext.drawImage(
          silhouette,
          Math.round(Math.cos(angle) * BLACK_OUTLINE_SOURCE_PIXELS),
          Math.round(Math.sin(angle) * BLACK_OUTLINE_SOURCE_PIXELS),
        );
      }
      outlineContext.globalCompositeOperation = "destination-out";
      outlineContext.drawImage(silhouette, 0, 0);

      return { colorMask, whiteOutlineMask };
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
    analysis = analyzeSpriteColors(assetUrl);
    spriteColorAnalysisCache.set(assetUrl, analysis);
  }
  return analysis;
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
      const sprite = Sprite.from(this.gameAssetUrl(spriteDefinition.asset));
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

      // PNG読込直後に一度だけ色替え用マスクを解析し、対戦中の負荷を増やさない。
      void this.prepareSpriteColorLayers(
        this.gameAssetUrl(spriteDefinition.asset),
      );
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
      const poseFrame = Math.floor(
        this.fighter.actionFrame / spriteDefinition.frameDuration,
      );
      return `${base}|${poseFrame}`;
    }
    if (this.animation) return `${base}|${this.fighter.actionFrame}`;
    return this.fighter.action === "walk"
      ? `${base}|${this.fighter.actionFrame % 16}`
      : base;
  }

  /** CSV内のアセットパスをViteの公開URLへ変換する。 */
  private gameAssetUrl(path: string): string {
    return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
  }

  /** 初回画像解析で作ったマスクをスプライトへ設定する。 */
  private async prepareSpriteColorLayers(assetUrl: string): Promise<void> {
    const analysis = await spriteColorAnalysisFor(assetUrl);
    if (!analysis || this.destroyed) return;

    const colorOverlay = this.spriteColorOverlay;
    const whiteOutline = this.spriteWhiteOutline;
    if (!colorOverlay || !whiteOutline) return;

    colorOverlay.texture = Texture.from(analysis.colorMask, true);
    colorOverlay.tint = this.fighter.character.primaryColor;
    colorOverlay.visible = this.fighter.character.colorVariant !== "default";

    whiteOutline.texture = Texture.from(analysis.whiteOutlineMask, true);
    whiteOutline.visible = this.usesWhiteOutline();

    // 非同期でレイヤーを追加した直後も、次回更新で現在のポーズへ同期する。
    this.lastVisualKey = "";
  }

  /** Blender出力に含まれる、現在アクション用のスプライトポーズを取得する。 */
  private spritePosesForCurrentAction(
    definition: BlenderSpriteAnimation,
  ): readonly BlenderSpritePose[] {
    const action =
      this.fighter.action === "crouchBlock" ? "block" : this.fighter.action;
    return definition.animations[action] ?? definition.animations.idle ?? [];
  }

  /** Blender JSONのフレーム値をスプライトへ反映する。 */
  private updateBlenderSprite(definition: BlenderSpriteAnimation): void {
    const poses = this.spritePosesForCurrentAction(definition);
    const fallbackPose: BlenderSpritePose = {};
    const frame = Math.floor(
      this.fighter.actionFrame / definition.frameDuration,
    );
    const looping =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block" ||
      this.fighter.action === "crouchBlock";
    const pose =
      poses.length === 0
        ? fallbackPose
        : poses[
            looping ? frame % poses.length : Math.min(frame, poses.length - 1)
          ];
    const mirror = this.fighter.facing;
    const scale = definition.scale * (pose.scale ?? 1);

    // 元PNG・色オーバーレイ・白枠を完全に同じ姿勢で動かし、ずれを防ぐ。
    for (const sprite of [
      this.animatedSprite,
      this.spriteColorOverlay,
      this.spriteWhiteOutline,
    ]) {
      if (!sprite) continue;
      sprite.position.set((pose.x ?? 0) * mirror, pose.y ?? 0);
      sprite.rotation = (pose.rotation ?? 0) * mirror;
      sprite.scale.set(scale * mirror, scale);
    }
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

    const animationFrame = Math.floor(
      (this.fighter.actionFrame * this.animation!.fps) / 60,
    );
    const looping =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block" ||
      this.fighter.action === "crouchBlock";
    const index = looping
      ? animationFrame % frames.length
      : Math.min(animationFrame, frames.length - 1);
    return frames[index];
  }

  /** しゃがみガードはblockアクションへフォールバックしてボーンフレームを取得する。 */
  private blenderFramesForCurrentAction() {
    const animations = this.animation?.animations;
    if (!animations) return undefined;

    const action =
      this.fighter.action === "crouchBlock" ? "block" : this.fighter.action;
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
