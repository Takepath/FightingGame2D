import type { CreationEngine } from "../engine/engine";
import {
  characterWithColor,
  colorOptionsFor,
  nextColorVariant,
} from "./colors";
import type { CpuLevel } from "./cpu";
import type { FightingGameConfig } from "./gameConfig";
import { MatchScreen } from "./matchScreen";
import { RoomClient } from "./online";
import { RoomLobby } from "./roomLobby";
import type { CharacterDefinition, ColorVariant, GameData } from "./types";

/** Top画面から選択画面・待ち受け・対戦画面へ進むモード。 */
type MenuMode = "local" | "training" | "online";

/** CSV上のキャラクターと、オンライン通信で送る選択IDの組。 */
interface CharacterChoice {
  choiceId: string;
  character: CharacterDefinition;
}

/** キャラクターと選択カラーを組にした、対戦開始前の1人分の選択結果。 */
interface PlayerSelection {
  readonly choice: CharacterChoice;
  readonly color: ColorVariant;
}

/** 色変更を反映済みの対戦キャラクターと、表示用カラーIDの組。 */
interface MatchSetup {
  readonly characters: readonly [CharacterDefinition, CharacterDefinition];
  readonly colors: readonly [ColorVariant, ColorVariant];
}

/** VS画面を表示してから実際の対戦画面へ遷移する時間。 */
const MATCHUP_DURATION_MS = 1800;

/** 図で示された、Top・待ち受け・キャラクター選択・対戦の遷移を管理する。 */
export class MenuFlow {
  private readonly topMenu = document.getElementById("top-menu")!;
  private readonly onlineWaiting = document.getElementById("online-waiting")!;
  private readonly characterSelect =
    document.getElementById("character-select")!;
  private readonly characterTitle = document.getElementById("character-title")!;
  private readonly characterStatus =
    document.getElementById("character-status")!;
  private readonly characterGrid = document.getElementById("character-grid")!;
  /** キャラクター決定後に表示するカラー選択領域。 */
  private readonly colorSelect = document.getElementById("color-select")!;
  /** 選択可能な5色のボタンを差し込む領域。 */
  private readonly colorOptions = document.getElementById("color-options")!;
  /** 対戦開始前に両者を表示するVS画面。 */
  private readonly matchupScreen = document.getElementById("matchup-screen")!;
  /** VS画面のP1キャラクター表示領域。 */
  private readonly matchupPlayerOne =
    document.getElementById("matchup-player-1")!;
  /** VS画面のP2キャラクター表示領域。 */
  private readonly matchupPlayerTwo =
    document.getElementById("matchup-player-2")!;
  private readonly cpuLevelSelector =
    document.getElementById("cpu-level-selector")!;
  private readonly cpuLevelButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-cpu-level]"),
  );
  private readonly choices: CharacterChoice[];
  private readonly lobby: RoomLobby;
  private mode: MenuMode = "local";
  private onlineClient: RoomClient | null = null;
  /** オンライン接続中に登録する、相手の選択受信処理の解除関数。 */
  private removeOnlineSelectionListener: (() => void) | null = null;
  /** 対戦画面中に相手が先に送った、次回キャラクター選択用の選択結果。 */
  private queuedOnlineChoice: PlayerSelection | null = null;
  /** カラー決定前の、ローカル側で選んだキャラクター。 */
  private pendingChoice: CharacterChoice | null = null;
  /** ローカル側でカラーまで決定した選択結果。 */
  private localChoice: PlayerSelection | null = null;
  /** オンライン相手から受信したカラーまで含む選択結果。 */
  private remoteChoice: PlayerSelection | null = null;
  /** ローカル対戦でP2へ割り当てるCPU難易度。 */
  private cpuLevel: CpuLevel = 1;
  private matchStarting = false;
  /** VS画面の表示を終了して対戦へ進めるためのタイマー。 */
  private matchupTimer: number | null = null;

  /** メニューボタンとロビーを初期化し、最初にTop画面を表示する。 */
  public constructor(
    private readonly engine: CreationEngine,
    private readonly data: GameData,
    private readonly config: FightingGameConfig,
  ) {
    this.choices = this.createChoices();
    document
      .getElementById("menu-local")!
      .addEventListener("click", () => this.showCharacterSelect("local"));
    document
      .getElementById("menu-online")!
      .addEventListener("click", () => this.showOnlineWaiting());
    document
      .getElementById("menu-training")!
      .addEventListener("click", () => this.showCharacterSelect("training"));
    document
      .getElementById("character-back")!
      .addEventListener("click", () => this.handleCharacterBack());
    this.cpuLevelButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.setCpuLevel(Number(button.dataset.cpuLevel) as CpuLevel);
      });
    });

    this.lobby = new RoomLobby(
      (client) => this.showCharacterSelect("online", client),
      // 対戦中に相手が退出した場合も、Pixi画面を破棄してTopへ戻す。
      () => this.returnToTop(),
      this.config.onlineRoom,
    );
    this.showTop();
  }

  /** Top画面だけを表示し、未完了のオンライン選択状態を破棄する。 */
  public showTop(): void {
    if (this.matchupTimer !== null) {
      window.clearTimeout(this.matchupTimer);
      this.matchupTimer = null;
    }
    this.removeOnlineSelectionListener?.();
    this.removeOnlineSelectionListener = null;
    this.mode = "local";
    this.onlineClient = null;
    this.queuedOnlineChoice = null;
    this.pendingChoice = null;
    this.localChoice = null;
    this.remoteChoice = null;
    this.matchStarting = false;
    // オンライン選択から戻る場合もWebSocketを確実に閉じる。
    this.lobby.disconnect();
    this.topMenu.classList.remove("is-hidden");
    this.onlineWaiting.classList.add("is-hidden");
    this.characterSelect.classList.add("is-hidden");
    this.colorSelect.classList.add("is-hidden");
    this.matchupScreen.classList.add("is-hidden");
  }

  /** 対戦画面を破棄してから、Top画面を表示する。 */
  private returnToTop(): void {
    this.engine.navigation.clearScreen();
    this.showTop();
  }

  /** 試合終了後、接続を維持したままモードに応じたキャラクター選択へ戻る。 */
  private returnToCharacterSelect(client?: RoomClient): void {
    this.engine.navigation.clearScreen();
    if (client) {
      this.showCharacterSelect("online", client);
      return;
    }
    this.showCharacterSelect("local");
  }

  /** Online選択時に待ち受け背景と合言葉ロビーを表示する。 */
  private showOnlineWaiting(): void {
    this.topMenu.classList.add("is-hidden");
    this.characterSelect.classList.add("is-hidden");
    this.colorSelect.classList.add("is-hidden");
    this.matchupScreen.classList.add("is-hidden");
    this.onlineWaiting.classList.remove("is-hidden");
    this.lobby.show();
  }

  /** モードに合わせた説明と9枚のカードを表示し、選択を受け付ける。 */
  private showCharacterSelect(mode: MenuMode, client?: RoomClient): void {
    // 対戦中に相手が先に送信した選択は、新しい選択画面へ引き継ぐ。
    const queuedOnlineChoice =
      mode === "online" && client === this.onlineClient
        ? this.queuedOnlineChoice
        : null;
    // 前回の選択画面や試合画面で残った受信処理を外し、二重に遷移しないようにする。
    this.removeOnlineSelectionListener?.();
    this.removeOnlineSelectionListener = null;
    this.mode = mode;
    this.onlineClient = client ?? null;
    this.queuedOnlineChoice = null;
    this.pendingChoice = null;
    this.localChoice = null;
    this.remoteChoice = queuedOnlineChoice;
    this.matchStarting = false;
    this.topMenu.classList.add("is-hidden");
    this.onlineWaiting.classList.add("is-hidden");
    this.matchupScreen.classList.add("is-hidden");
    this.characterSelect.classList.remove("is-hidden");
    this.colorSelect.classList.add("is-hidden");
    this.characterGrid.classList.remove("is-hidden");
    this.cpuLevelSelector.classList.toggle("is-hidden", mode !== "local");
    this.setCharacterBackLabel(false);

    if (mode === "online" && client) {
      this.characterTitle.textContent = `PLAYER ${client.player! + 1} のキャラクターを選択してください`;
      this.characterStatus.textContent =
        "相手もキャラクターを選択するまで待機します。";
      this.removeOnlineSelectionListener = client.onSelection(
        (choiceId, color) => {
          if (this.onlineClient !== client) return;
          const choice = this.choices.find(
            (candidate) => candidate.choiceId === choiceId,
          );
          const selection = choice ? { choice, color } : null;
          if (!selection) return;
          // 相手が先にキャラクター選択へ戻った場合も、イベントを捨てず次の選択画面へ引き継ぐ。
          if (this.matchStarting) {
            this.queuedOnlineChoice = selection;
            return;
          }
          this.remoteChoice = selection;
          if (this.remoteChoice && !this.localChoice) {
            this.characterStatus.textContent =
              "相手が選択を完了しました。あなたのキャラクターとカラーを選んでください。";
          }
          this.startOnlineMatchIfReady();
        },
      );
    } else {
      this.characterTitle.textContent = "キャラクターを選択してください";
      if (mode === "training") {
        this.characterStatus.textContent =
          "選択後、トレーニング対戦を開始します。";
      } else {
        this.setCpuLevel(this.cpuLevel);
      }
    }
    if (this.remoteChoice && mode === "online") {
      this.characterStatus.textContent =
        "相手が選択を完了しました。あなたのキャラクターとカラーを選んでください。";
    }
    this.renderChoices();
  }

  /** CSVの各キャラクターを1枚ずつ、選択候補へ変換する。 */
  private createChoices(): CharacterChoice[] {
    return this.data.characters.map((character) => ({
      choiceId: character.id,
      character,
    }));
  }

  /** 選択カードをDOMで描画し、各カードを決定ボタンとして登録する。 */
  private renderChoices(): void {
    this.characterGrid.replaceChildren();
    this.applyCharacterGridLayout(this.choices.length);
    this.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-card";
      button.style.setProperty(
        "--card-primary",
        `#${choice.character.primaryColor.toString(16).padStart(6, "0")}`,
      );
      button.style.setProperty(
        "--card-accent",
        `#${choice.character.accentColor.toString(16).padStart(6, "0")}`,
      );
      const icon = this.createCharacterIcon(choice.character);
      const name = document.createElement("span");
      name.className = "character-name";
      name.textContent = choice.character.name;
      button.setAttribute("aria-label", `${choice.character.name} を選択`);
      button.replaceChildren(icon, name);
      button.addEventListener("click", () => this.select(choice));
      this.characterGrid.appendChild(button);
    });
  }

  /** 表示人数に応じて列数・カード高・アイコンサイズを段階的に調整する。 */
  private applyCharacterGridLayout(count: number): void {
    const layout =
      count <= 2
        ? {
            columns: 2,
            iconSize: "clamp(104px, 18vw, 142px)",
            cardHeight: "210px",
          }
        : count <= 4
          ? {
              columns: 2,
              iconSize: "clamp(76px, 14vw, 112px)",
              cardHeight: "166px",
            }
          : count <= 9
            ? {
                columns: 3,
                iconSize: "clamp(58px, 9vw, 72px)",
                cardHeight: "132px",
              }
            : count <= 16
              ? {
                  columns: 4,
                  iconSize: "clamp(48px, 7vw, 60px)",
                  cardHeight: "112px",
                }
              : {
                  columns: 5,
                  iconSize: "clamp(38px, 5vw, 48px)",
                  cardHeight: "96px",
                };
    this.characterGrid.style.setProperty(
      "--character-columns",
      String(layout.columns),
    );
    this.characterGrid.style.setProperty(
      "--character-icon-size",
      layout.iconSize,
    );
    this.characterGrid.style.setProperty(
      "--character-card-min-height",
      layout.cardHeight,
    );
  }

  /** CSVにPNGが指定されていれば画像を、未指定・失敗時は既定の顔アイコンを返す。 */
  private createCharacterIcon(character: CharacterDefinition): HTMLElement {
    const fallback = (): HTMLSpanElement => {
      const face = document.createElement("span");
      face.className = "character-face";
      face.textContent = "●";
      return face;
    };
    if (!character.iconAsset) return fallback();

    const icon = document.createElement("img");
    icon.className = "character-icon";
    icon.src = this.gameAssetUrl(character.iconAsset);
    icon.alt = `${character.name} のアイコン`;
    icon.addEventListener("error", () => icon.replaceWith(fallback()), {
      once: true,
    });
    return icon;
  }

  /** ViteのBASE_URLを考慮して、CSVの公開アセットパスを画像URLへ変換する。 */
  private gameAssetUrl(path: string): string {
    return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
  }

  /** 選択したキャラクターを保持し、続けて5色のカラー選択へ進める。 */
  private select(choice: CharacterChoice): void {
    if (this.matchStarting || this.localChoice || this.pendingChoice) return;

    this.pendingChoice = choice;
    this.characterGrid.classList.add("is-hidden");
    this.cpuLevelSelector.classList.add("is-hidden");
    this.colorSelect.classList.remove("is-hidden");
    this.characterTitle.textContent = `${choice.character.name} のカラーを選択してください`;
    this.characterStatus.textContent = "カラーを決定すると対戦準備へ進みます。";
    this.setCharacterBackLabel(true);
    this.renderColorOptions(choice.character);
  }

  /** カラー選択ボタンを、選択済みキャラクターのCSV色を含む5種類で描画する。 */
  private renderColorOptions(character: CharacterDefinition): void {
    this.colorOptions.replaceChildren();
    for (const option of colorOptionsFor(character)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-option";
      button.style.setProperty(
        "--color-primary",
        this.toCssColor(option.primaryColor),
      );
      button.style.setProperty(
        "--color-accent",
        this.toCssColor(option.accentColor),
      );
      button.setAttribute("aria-label", `${option.label}を選択`);

      const swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = option.label;
      button.replaceChildren(swatch, label);
      button.addEventListener("click", () => this.selectColor(option.id));
      this.colorOptions.appendChild(button);
    }
  }

  /** 選んだカラーを確定し、ローカルCPUまたはオンライン相手の選択待ちへ進める。 */
  private selectColor(color: ColorVariant): void {
    const choice = this.pendingChoice;
    if (!choice || this.matchStarting) return;

    this.pendingChoice = null;
    this.localChoice = { choice, color };
    this.colorSelect.classList.add("is-hidden");
    this.setCharacterBackLabel(false);

    if (this.mode === "online" && this.onlineClient) {
      this.characterTitle.textContent = "対戦相手の選択を待っています";
      this.characterStatus.textContent = `${choice.character.name}（${this.colorLabel(choice.character, color)}）を選択しました。`;
      this.onlineClient.sendSelection(choice.choiceId, color);
      this.startOnlineMatchIfReady();
      return;
    }

    const choiceIndex = this.choices.indexOf(choice);
    const opponent = this.choices[(choiceIndex + 1) % this.choices.length];
    this.beginMatch([this.localChoice, { choice: opponent, color: "default" }]);
  }

  /** 戻る操作を、カラー選択中のみキャラクター選択への復帰として扱う。 */
  private handleCharacterBack(): void {
    if (!this.pendingChoice) {
      this.showTop();
      return;
    }

    this.pendingChoice = null;
    this.colorSelect.classList.add("is-hidden");
    this.characterGrid.classList.remove("is-hidden");
    this.cpuLevelSelector.classList.toggle("is-hidden", this.mode !== "local");
    this.characterTitle.textContent = "キャラクターを選択してください";
    this.characterStatus.textContent =
      this.mode === "online"
        ? "相手もキャラクターとカラーを選択するまで待機します。"
        : this.mode === "training"
          ? "選択後、トレーニング対戦を開始します。"
          : `CPU LEVELを選択してから、キャラクターを決定してください。`;
    this.setCharacterBackLabel(false);
  }

  /** 戻るボタンのラベルを、現在の選択段階に合わせて切り替える。 */
  private setCharacterBackLabel(inColorSelect: boolean): void {
    const button = document.getElementById("character-back")!;
    button.textContent = inColorSelect
      ? "← キャラクター選択へ戻る"
      : "← Topへ戻る";
  }

  /** CPUレベルの選択状態を更新し、ローカル対戦の説明へ反映する。 */
  private setCpuLevel(level: CpuLevel): void {
    this.cpuLevel = level;
    this.cpuLevelButtons.forEach((button) => {
      const selected = Number(button.dataset.cpuLevel) === level;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (this.mode === "local") {
      this.characterStatus.textContent = `CPU LEVELを選択してから、キャラクターを決定してください。`;
    }
  }

  /** オンライン両者の選択が揃った時だけ、プレイヤー番号順の組み合わせで始める。 */
  private startOnlineMatchIfReady(): void {
    if (
      !this.onlineClient ||
      !this.localChoice ||
      !this.remoteChoice ||
      this.onlineClient.player === null
    ) {
      return;
    }
    const selections: readonly [PlayerSelection, PlayerSelection] =
      this.onlineClient.player === 0
        ? [this.localChoice, this.remoteChoice]
        : [this.remoteChoice, this.localChoice];
    this.beginMatch(selections, this.onlineClient);
  }

  /** 色重複を調整してVS画面を表示し、所定時間後に実際の対戦を開始する。 */
  private beginMatch(
    selections: readonly [PlayerSelection, PlayerSelection],
    client?: RoomClient,
  ): void {
    if (this.matchStarting) return;
    this.matchStarting = true;

    const setup = this.createMatchSetup(selections);
    this.topMenu.classList.add("is-hidden");
    this.onlineWaiting.classList.add("is-hidden");
    this.characterSelect.classList.add("is-hidden");
    this.colorSelect.classList.add("is-hidden");
    this.renderMatchup(setup);
    this.matchupScreen.classList.remove("is-hidden");
    this.matchupTimer = window.setTimeout(() => {
      this.matchupTimer = null;
      void this.startMatch(setup.characters, client);
    }, MATCHUP_DURATION_MS);
  }

  /** トレーニング以外の同キャラ同色だけを、P2の次色へ強制変更する。 */
  private createMatchSetup(
    selections: readonly [PlayerSelection, PlayerSelection],
  ): MatchSetup {
    const [playerOne, originalPlayerTwo] = selections;
    const playerTwo =
      this.mode !== "training" &&
      playerOne.choice.choiceId === originalPlayerTwo.choice.choiceId &&
      playerOne.color === originalPlayerTwo.color
        ? {
            ...originalPlayerTwo,
            color: nextColorVariant(originalPlayerTwo.color),
          }
        : originalPlayerTwo;

    return {
      characters: [
        characterWithColor(playerOne.choice.character, playerOne.color),
        characterWithColor(playerTwo.choice.character, playerTwo.color),
      ],
      colors: [playerOne.color, playerTwo.color],
    };
  }

  /** 色を反映したP1・P2のキャラクターをVS画面の両端へ描画する。 */
  private renderMatchup(setup: MatchSetup): void {
    this.renderMatchupPlayer(
      this.matchupPlayerOne,
      "PLAYER 1",
      setup.characters[0],
      setup.colors[0],
    );
    this.renderMatchupPlayer(
      this.matchupPlayerTwo,
      "PLAYER 2",
      setup.characters[1],
      setup.colors[1],
    );
  }

  /** VS画面の片側へ、キャラクター名・色名・アイコンを配置する。 */
  private renderMatchupPlayer(
    container: HTMLElement,
    playerLabel: string,
    character: CharacterDefinition,
    color: ColorVariant,
  ): void {
    container.style.setProperty(
      "--matchup-primary",
      this.toCssColor(character.primaryColor),
    );
    container.style.setProperty(
      "--matchup-accent",
      this.toCssColor(character.accentColor),
    );

    const label = document.createElement("p");
    label.className = "matchup-label";
    label.textContent = playerLabel;
    const portrait = document.createElement("div");
    portrait.className = "matchup-portrait";
    portrait.append(this.createCharacterIcon(character));
    const name = document.createElement("p");
    name.className = "matchup-name";
    name.textContent = character.name;
    const colorName = document.createElement("p");
    colorName.className = "matchup-color";
    colorName.textContent = `COLOR: ${this.colorLabel(character, color)}`;
    container.replaceChildren(label, portrait, name, colorName);
  }

  /** CSV色を含むカラー名を、画面表示用の日本語へ変換する。 */
  private colorLabel(
    character: CharacterDefinition,
    color: ColorVariant,
  ): string {
    return (
      colorOptionsFor(character).find((option) => option.id === color)?.label ??
      "デフォルト"
    );
  }

  /** 数値カラーをCSSで使える6桁の16進数へ変換する。 */
  private toCssColor(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  /** VS画面の終了後、選択済みの2人で新しい対戦画面を生成する。 */
  private async startMatch(
    selectedCharacters: readonly [CharacterDefinition, CharacterDefinition],
    client?: RoomClient,
  ): Promise<void> {
    // 対戦中も選択イベントを1件だけ監視し、相手が先に戻った時の選択を次回画面へ引き継ぐ。
    this.matchupScreen.classList.add("is-hidden");
    // トレーニングではP2の入力を固定し、練習専用の対戦にする。
    MatchScreen.configure(
      this.data,
      selectedCharacters,
      this.mode === "training",
      this.mode === "local" ? this.cpuLevel : null,
      {
        returnToTop: () => this.returnToTop(),
        returnToCharacterSelect: () => this.returnToCharacterSelect(client),
      },
    );
    await this.engine.navigation.showScreen(MatchScreen);
    const match = this.engine.navigation.currentScreen;
    if (client && match instanceof MatchScreen) match.startOnline(client);
  }
}
