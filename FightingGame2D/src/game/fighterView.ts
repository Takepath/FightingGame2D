import { Container, Graphics, Text } from "pixi.js";

import { GROUND_Y, POSITION_SCALE, type FighterState } from "./simulation";
import type { BlenderAnimationData } from "./types";

/** Draws either sampled Blender bone data or a procedural stick fighter. */
export class FighterView extends Container {
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private readonly nameplate: Text;
  private readonly animation?: BlenderAnimationData;

  public constructor(
    private readonly fighter: FighterState,
    animation?: BlenderAnimationData,
  ) {
    super();
    this.animation = animation;
    this.nameplate = new Text({
      text: fighter.character.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 15,
        fontWeight: "700",
        fill: "#f7fbff",
        stroke: { color: "#10131f", width: 4 },
      },
      anchor: 0.5,
    });
    this.addChild(this.shadow, this.body, this.nameplate);
  }

  public update(): void {
    this.position.set(
      this.fighter.x / POSITION_SCALE,
      this.fighter.y / POSITION_SCALE,
    );
    this.shadow
      .clear()
      .ellipse(0, 2, 52, 10)
      .fill({ color: 0x050711, alpha: 0.45 });

    this.body.clear();
    if (this.fighter.character.renderType === "blender" && this.animation) {
      this.drawBlenderPose();
    } else {
      this.drawStickFigure();
    }
    if (this.fighter.stun > 0) {
      this.body.circle(0, -150, 7).fill({ color: 0xfff06a });
      this.body.circle(18, -140, 5).fill({ color: 0xfff06a });
    }
    this.nameplate.position.set(0, -184);
    this.nameplate.scale.x = this.fighter.facing;
  }

  private drawBlenderPose(): void {
    const pose = this.samplePose();
    const mirror = this.fighter.facing;
    if (!pose) {
      this.drawStickFigure();
      return;
    }

    for (const segment of pose.segments) {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, width = 8] = segment;
      this.body
        .moveTo(x1 * mirror, y1)
        .lineTo(x2 * mirror, y2)
        .stroke({
          color: this.fighter.character.primaryColor,
          width,
          cap: "round",
        });
      this.body.circle(x2 * mirror, y2, Math.max(3, width * 0.42)).fill({
        color: this.fighter.character.accentColor,
      });
    }
    this.body
      .circle(0, -122, 16)
      .fill({ color: this.fighter.character.primaryColor })
      .circle(-5 * mirror, -125, 3)
      .fill({ color: 0xf7fbff });
  }

  private samplePose() {
    const animations = this.animation?.animations;
    if (!animations) return undefined;
    const frames = animations[this.fighter.action] ?? animations.idle;
    if (!frames?.length) return undefined;
    const animationFrame = Math.floor(
      (this.fighter.actionFrame * this.animation!.fps) / 60,
    );
    const index =
      this.fighter.action === "idle" ||
      this.fighter.action === "walk" ||
      this.fighter.action === "block"
        ? animationFrame % frames.length
        : Math.min(animationFrame, frames.length - 1);
    return frames[index];
  }

  private drawStickFigure(): void {
    const mirror = this.fighter.facing;
    const walkSwing =
      this.fighter.action === "walk"
        ? ((this.fighter.actionFrame % 16) - 8) * 2
        : 0;
    const attacking =
      this.fighter.action === "light" ||
      this.fighter.action === "heavy" ||
      this.fighter.action === "special";
    const armReach = attacking ? 54 : 28;
    const lean = this.fighter.action === "block" ? -10 : 0;
    const color = this.fighter.character.primaryColor;
    const accent = this.fighter.character.accentColor;

    this.body
      .moveTo(0, -82)
      .lineTo(lean * mirror, -40)
      .stroke({ color, width: 12, cap: "round" })
      .moveTo(lean * mirror, -72)
      .lineTo((lean + armReach) * mirror, attacking ? -72 : -48)
      .stroke({ color: accent, width: 8, cap: "round" })
      .moveTo(lean * mirror, -72)
      .lineTo((lean - 30) * mirror, -48)
      .stroke({ color, width: 8, cap: "round" })
      .moveTo(lean * mirror, -40)
      .lineTo((-21 + walkSwing) * mirror, 0)
      .stroke({ color, width: 10, cap: "round" })
      .moveTo(lean * mirror, -40)
      .lineTo((22 - walkSwing) * mirror, 0)
      .stroke({ color: accent, width: 10, cap: "round" })
      .circle(0, -104, 20)
      .fill({ color })
      .circle(6 * mirror, -106, 3)
      .fill({ color: 0xffffff });

    if (this.fighter.action === "special") {
      this.body
        .circle(74 * mirror, -70, 18)
        .fill({ color: accent, alpha: 0.78 });
    }
    if (this.fighter.action === "ko") {
      this.body.rotation = 1.15 * mirror;
    } else {
      this.body.rotation = 0;
    }
  }

  public get groundY(): number {
    return GROUND_Y;
  }
}
