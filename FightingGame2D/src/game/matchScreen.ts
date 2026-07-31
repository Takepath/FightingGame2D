import type { Ticker } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";

import { FrameSynchronizer } from "./frameSynchronizer";
import { FighterView } from "./fighterView";
import { InputManager } from "./input";
import { OnlineFrameBridge, RoomClient } from "./online";
import {
  GROUND_Y,
  MatchSimulation,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./simulation";
import type { GameData } from "./types";

// 60FPS固定シミュレーション用の更新間隔
const FIXED_STEP_MS = 1000 / 60;

// 1フレーム描画中に実行できるシミュレーション更新の最大回数
const MAX_STEPS_PER_RENDER = 5;

/**
 * 対戦画面クラス
 * 描画(Render)とゲームシミュレーション(60Hz)を分離して管理する
 */
export class MatchScreen extends Container {
  /** 読み込むアセットバンドル */
  public static assetBundles: string[] = [];

  /** ゲーム全体の設定データ */
  private static gameData: GameData | null = null;

  /** ゲーム画面全体 */
  private readonly world = new Container();

  /** ステージ背景 */
  private readonly stageArt = new Graphics();

  /** 飛び道具描画 */
  private readonly projectileArt = new Graphics();

  /** HUD(体力バーなど) */
  private readonly hudArt = new Graphics();

  /** 入力管理 */
  private readonly input = new InputManager();

  /** フレーム同期管理(オンライン同期用) */
  private readonly synchronizer = new FrameSynchronizer();

  /** ゲームシミュレーション */
  private readonly simulation: MatchSimulation;

  /** プレイヤー表示 */
  private readonly fighterViews: [FighterView, FighterView];

  /** タイトル表示 */
  private readonly title: Text;

  /** 情報表示 */
  private readonly info: Text;

  /** ラウンド表示 */
  private readonly roundText: Text;

  /** KO表示 */
  private readonly koText: Text;

  /** 経過時間蓄積 */
  private accumulatorMs = 0;

  /** 一時停止フラグ */
  private paused = false;

  /** オンライン同期 */
  private online: OnlineFrameBridge | null = null;

  /** 自分のプレイヤー番号 */
  private onlinePlayer: 0 | 1 | null = null;

  /**  タイマー表示 */
  private readonly timer: Text; 

  /**
   * ゲームデータを設定
   */
  public static configure(data: GameData): void {
    MatchScreen.gameData = data;
  }

  /**
   * コンストラクタ
   * ゲーム画面の初期化
   */
  public constructor() {
    super();

    const data = MatchScreen.gameData;
    if (!data) throw new Error("ゲームデータが初期化されていません");

    // 使用キャラクター決定
    const selectedCharacters = [
      data.characters[0],
      data.characters[1],
    ] as const;

    // シミュレーション生成
    this.simulation = new MatchSimulation(selectedCharacters, data.moves);

    // プレイヤー表示生成
    this.fighterViews = [
      new FighterView(
        this.simulation.fighters[0],
        data.blenderAnimations[selectedCharacters[0].id],
      ),
      new FighterView(
        this.simulation.fighters[1],
        data.blenderAnimations[selectedCharacters[1].id],
      ),
    ];

    // HUD文字生成
    this.title = this.createText("FRAME FIGHTERS", 23, "#ecf5ff");
    this.info = this.createText("", 14, "#a9c7ed");
    this.roundText = this.createText("ROUND 1", 24, "#ffffff");
    this.koText = this.createText("", 46, "#fff1a3");
    this.timer = this.createText("99", 50, "#ffffff");

    // 描画順に追加
    this.world.addChild(
      this.stageArt,
      this.projectileArt,
      this.fighterViews[0],
      this.fighterViews[1],
      this.hudArt,
    );

    this.world.addChild(
      //this.title,
      this.info,
      this.roundText,
      this.koText,
      this.timer,
    );

    this.addChild(this.world);

    // 初回描画
    this.drawStage();
    this.drawHud();
    this.refreshViews();
  }

  /**
   * オンライン対戦開始
   */
  public startOnline(client: RoomClient): void {
    if (client.player === null) return;

    this.online = new OnlineFrameBridge(client);
    this.onlinePlayer = client.player;

    this.synchronizer.reset();
    this.simulation.resetMatch();
    this.accumulatorMs = 0;
  }

  /**
   * オンライン対戦終了
   */
  public stopOnline(): void {
    if (!this.online) return;

    this.online = null;
    this.onlinePlayer = null;

    this.synchronizer.reset();
    this.simulation.resetMatch();
    this.accumulatorMs = 0;
  }

  /**
   * 毎フレーム更新
   * 描画フレームとは独立して60FPSシミュレーションを実行
   */
  public update(time: Ticker): void {
    if (this.paused) return;

    this.accumulatorMs += Math.min(time.deltaMS, 250);

    let executedSteps = 0;

    while (
      this.accumulatorMs >= FIXED_STEP_MS &&
      executedSteps < MAX_STEPS_PER_RENDER
    ) {

      // オンラインなら同期入力
      // オフラインならローカル入力
      const inputs = this.online
        ? this.online.inputsForFrame(
            this.synchronizer.frame,
            this.input.sample(0),
          )
        : ([this.input.sample(0), this.input.sample(1)] as const);

      if (!inputs) {
        // 相手入力待ち
        this.accumulatorMs = Math.min(this.accumulatorMs, FIXED_STEP_MS);
        break;
      }

      // シミュレーション1フレーム進める
      this.synchronizer.advance(this.simulation, inputs);

      this.accumulatorMs -= FIXED_STEP_MS;
      executedSteps++;
    }

    // 長時間停止後の大量更新を防止
    if (executedSteps === MAX_STEPS_PER_RENDER)
      this.accumulatorMs = 0;

    // 描画更新
    this.refreshViews();
  }

  /**
   * ウィンドウサイズ変更
   */
  public resize(width: number, height: number): void {
    const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);

    this.world.scale.set(scale);

    this.world.position.set(
      (width - STAGE_WIDTH * scale) / 2,
      (height - STAGE_HEIGHT * scale) / 2,
    );
  }

  /** 一時停止 */
  public async pause(): Promise<void> {
    this.paused = true;
    this.accumulatorMs = 0;
  }

  /** 再開 */
  public async resume(): Promise<void> {
    this.paused = false;
  }

  /** フォーカスを失った */
  public blur(): void {
    this.paused = true;
    this.accumulatorMs = 0;
  }

  /** フォーカス復帰 */
  public focus(): void {
    this.paused = false;
  }

  /** 終了処理 */
  public reset(): void {
    this.input.destroy();
  }

  /**
   * 共通Text生成
   */
  private createText(text: string, size: number, color: string): Text {
    return new Text({
      text,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: size,
        fontWeight: "800",
        fill: color,
        stroke: { color: "#070b16", width: 5 },
        letterSpacing: 1,
      },
      anchor: 0.5,
    });
  }

  /**
   * ステージ背景描画
   * 地面・背景・建物・装飾を描画
   */
  private drawStage(): void {
    const art = this.stageArt;
    art.clear();
    art.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill({ color: 0x080d1c });
    art.rect(0, 300, STAGE_WIDTH, 270).fill({ color: 0x152546 });
    art
      .rect(0, GROUND_Y, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y)
      .fill({ color: 0x0d162b });
    art
      .rect(0, GROUND_Y - 5, STAGE_WIDTH, 5)
      .fill({ color: 0x6dcbf1, alpha: 0.8 });

    for (let x = -100; x < STAGE_WIDTH + 160; x += 64) {
      art
        .moveTo(x, STAGE_HEIGHT)
        .lineTo(x + 230, GROUND_Y)
        .stroke({
          color: 0x2d4a76,
          width: 1,
          alpha: 0.75,
        });
    }
    for (let y = GROUND_Y + 24; y < STAGE_HEIGHT; y += 30) {
      art
        .moveTo(0, y)
        .lineTo(STAGE_WIDTH, y)
        .stroke({ color: 0x2d4a76, width: 1, alpha: 0.7 });
    }

    art.circle(220, 250, 96).fill({ color: 0x493b78, alpha: 0.22 });
    art.circle(1050, 220, 132).fill({ color: 0x11798d, alpha: 0.18 });
    art.rect(80, 330, 210, 130).fill({ color: 0x091225, alpha: 0.65 });
    art.rect(990, 310, 190, 150).fill({ color: 0x091225, alpha: 0.65 });
    for (let x = 106; x <= 248; x += 34) {
      art.rect(x, 352, 20, 50).fill({ color: 0x4fc3dd, alpha: 0.34 });
    }
    for (let x = 1018; x <= 1148; x += 32) {
      art.rect(x, 335, 18, 66).fill({ color: 0xb67bdf, alpha: 0.3 });
    }
  }

  /**
   * HUD描画
   * 体力バー・ラウンド表示位置などを更新
   */
  private drawHud(): void {
    const [left, right] = this.simulation.fighters;
    const art = this.hudArt;
    art.clear();

    this.drawHealthBar(
      48,
      45,
      470,
      left.health / left.character.maxHealth,
      left.character.primaryColor,
      false,
    );
    this.drawHealthBar(
      STAGE_WIDTH - 48,
      45,
      470,
      right.health / right.character.maxHealth,
      right.character.primaryColor,
      true,
    );

    //this.title.position.set(STAGE_WIDTH / 2, 28);
    this.info.position.set(STAGE_WIDTH / 2, 677);
    this.roundText.position.set(STAGE_WIDTH / 2, 77);
    this.koText.position.set(STAGE_WIDTH / 2, 265);
    this.timer.position.set(STAGE_WIDTH / 2 , 28);
  }

  /**
   * 体力バー描画
   *
   * @param x 表示位置X
   * @param y 表示位置Y
   * @param width バーの幅
   * @param ratio 残体力(0～1)
   * @param color バー色
   * @param reverse 右側表示か
   */
  private drawHealthBar(
    x: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
    reverse: boolean,
  ): void {
    const barX = reverse ? x - width : x;
    this.hudArt
      .roundRect(barX, y, width, 25, 7)
      .fill({ color: 0x030712, alpha: 0.85 });
    const fillWidth = Math.max(0, Math.round((width - 6) * ratio));
    const fillX = reverse ? x - 3 - fillWidth : x + 3;
    this.hudArt.roundRect(fillX, y + 3, fillWidth, 19, 5).fill({ color });
  }

   /**
   * 全表示更新
   * ・キャラクター
   * ・飛び道具
   * ・HUD
   * ・ラウンド表示
   * ・勝者表示
   * ・同期情報
   */
  private refreshViews(): void {
    this.fighterViews[0].update();
    this.fighterViews[1].update();
    this.drawProjectiles();
    this.drawHud();
    this.roundText.text = `ROUND ${this.simulation.round}`;
    this.info.text = this.online
      ? `ONLINE P${(this.onlinePlayer ?? 0) + 1}  WASD / F G H Q  •  ↓ ↘ → + H = 波動拳`
      : "WASD / F G H Q     十字キー / 1 2 3 0     XBOX: A X B RB  •  ↓ ↘ → + H = 波動拳";
    this.koText.text =
      (this.simulation.winner === null)? 
      "": `${this.simulation.fighters[this.simulation.winner].character.name}  WINS`;
      // const checksum = this.synchronizer.lastChecksum
      // .toString(16)
      // .padStart(8, "0")
      // .toUpperCase();
    this.title.text = `FRAME FIGHTERS`;

        let time: number = 99; 


    const timercount = setInterval(() => {
      time--;
      
      this.timer.text = time.toString();

      if (time <= 0) { 
        clearInterval(timercount); // 停止処理
      }
    }, 1000);
  }

  /**
   * 飛び道具描画
   * 全Projectileを円形エフェクトとして表示
   */
  private drawProjectiles(): void {
    this.projectileArt.clear();
    for (const projectile of this.simulation.projectiles) {
      const x = projectile.x / 100;
      const y = projectile.y / 100;
      const color =
        this.simulation.fighters[projectile.owner].character.accentColor;
      this.projectileArt.circle(x, y, 22).fill({ color, alpha: 0.16 });
      this.projectileArt.circle(x, y, 14).fill({ color, alpha: 0.5 });
      this.projectileArt.circle(x, y, 7).fill({ color: 0xe8f8ff });
    }
  }
}
