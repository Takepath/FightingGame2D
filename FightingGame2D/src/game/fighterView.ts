import { Container, Graphics, Text } from "pixi.js";

import { GROUND_Y, POSITION_SCALE, type FighterState } from "./simulation";
import type { BlenderAnimationData } from "./types";

/**
 * ファイター表示クラス
 *
 * ・Blenderで作成したアニメーション表示
 * ・簡易スティックファイター表示
 * のどちらにも対応する描画クラス
 */
export class FighterView extends Container {
  /** 地面に表示する影 */
  private readonly shadow = new Graphics();

  /** キャラクター本体 */
  private readonly body = new Graphics();

  /** キャラクター名表示 */
  private readonly nameplate: Text;

  /** Blenderアニメーションデータ（存在する場合のみ） */
  private readonly animation?: BlenderAnimationData;

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

    // 描画順
    // 影 → 本体 → 名前
    this.addChild(
      this.shadow,
      this.body,
      this.nameplate,
    );
  }

  //====================================================
  // 毎フレーム更新
  //====================================================
  public update(): void {

    // キャラクター位置更新
    this.position.set(
      this.fighter.x / POSITION_SCALE,
      this.fighter.y / POSITION_SCALE,
    );

    //====================================================
    // 地面の影を描画
    //====================================================
    this.shadow
      .clear()
      .ellipse(0, 2, 52, 10)
      .fill({
        color: 0x050711,
        alpha: 0.45,
      });

    //====================================================
    // 本体描画
    //====================================================
    this.body.clear();

    // Blenderモデルが存在する場合はBlender描画
    if (
      this.fighter.character.renderType === "blender" &&
      this.animation
    ) {
      this.drawBlenderPose();
    } else {
      // 無い場合はスティックマン描画
      this.drawStickFigure();
    }

    //====================================================
    // スタン状態のエフェクト表示
    //====================================================
    if (this.fighter.stun > 0) {
      this.body
        .circle(0, -150, 7)
        .fill({ color: 0xfff06a });

      this.body
        .circle(18, -140, 5)
        .fill({ color: 0xfff06a });
    }

    //====================================================
    // 名前位置更新
    //====================================================
    this.nameplate.position.set(0, -184);
  }

  //====================================================
  // Blenderアニメーション描画
  //====================================================
  private drawBlenderPose(): void {

    // 現在フレームのポーズ取得
    const pose = this.samplePose();

    const mirror = this.fighter.facing;

    // ポーズが取得できなければ簡易描画へ
    if (!pose) {
      this.drawStickFigure();
      return;
    }

    //====================================================
    // ボーンを線として描画
    //====================================================
    for (const segment of pose.segments) {

      const [
        x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0,
        width = 8,
      ] = segment;

      this.body
        .moveTo(x1 * mirror, y1)
        .lineTo(x2 * mirror, y2)
        .stroke({
          color: this.fighter.character.primaryColor,
          width,
          cap: "round",
        });

      // 関節描画
      this.body
        .circle(
          x2 * mirror,
          y2,
          Math.max(3, width * 0.42),
        )
        .fill({
          color: this.fighter.character.accentColor,
        });
    }

    //====================================================
    // 頭部描画
    //====================================================
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

  //====================================================
  // 現在表示するアニメーションフレーム取得
  //====================================================
  private samplePose() {

    const animations = this.animation?.animations;

    if (!animations) return undefined;

    // 現在アクションのアニメーション取得
    const frames =
      animations[this.fighter.action] ??
      animations.idle;

    if (!frames?.length) return undefined;

    // 60FPS基準からBlenderFPSへ変換
    const animationFrame = Math.floor(
      (this.fighter.actionFrame * this.animation!.fps) / 60,
    );

    //====================================================
    // ループアニメーションと単発アニメーションを切り替え
    //====================================================
    const index =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block"
        ? animationFrame % frames.length
        : Math.min(animationFrame, frames.length - 1);

    return frames[index];
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
      this.fighter.action === "block"
        ? -10
        : 0;

    const color = this.fighter.character.primaryColor;
    const accent = this.fighter.character.accentColor;

    //====================================================
    // 胴体・腕・脚・頭を描画
    //====================================================
    this.body
      .moveTo(0, -82)
      .lineTo(lean * mirror, -40)
      .stroke({
        color,
        width: 12,
        cap: "round",
      })

      .moveTo(lean * mirror, -72)
      .lineTo(
        (lean + armReach) * mirror,
        attacking ? -72 : -48,
      )
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
      this.body
        .circle(74 * mirror, -70, 18)
        .fill({
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

  //====================================================
  // 地面Y座標取得
  //====================================================
  public get groundY(): number {
    return GROUND_Y;
  }
}
