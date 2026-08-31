import backgroundManifest from "virtual:fighting-game-backgrounds";

/** 対戦時に使う背景の識別子と、public配下のPNGパス。 */
export interface StageDefinition {
  /** 通信・選択状態で使用する安定したステージ識別子。 */
  readonly id: string;
  /** public相対の背景PNGパス。nullなら従来のコード描画背景を使う。 */
  readonly asset: string | null;
}

/** PNGを選ばない時に従来のコード描画背景を使う、先頭固定のステージ。 */
export const DEFAULT_STAGE: StageDefinition = {
  id: "default",
  asset: null,
};

/**
 * public/background直下のPNGをステージ候補へ変換する。
 * asset自体をIDにすることで、任意のファイル名でも一意かつ再現可能に選択を同期できる。
 */
export const STAGES: readonly StageDefinition[] = [
  DEFAULT_STAGE,
  ...backgroundManifest.map((asset) => ({ id: asset, asset })),
];

/** 指定IDのステージを返す。不明・未指定時は従来背景へ安全に戻す。 */
export function stageForId(
  stageId: string | null | undefined,
): StageDefinition {
  return STAGES.find((stage) => stage.id === stageId) ?? DEFAULT_STAGE;
}

/** ファイル名からステージ選択画面に表示するラベルを生成する。 */
export function stageDisplayLabel(stage: StageDefinition): string {
  if (stage.asset === null) return "デフォルト";

  const pathSegments = stage.asset.split("/");
  const fileName = pathSegments[pathSegments.length - 1] ?? stage.asset;
  const name = fileName
    .replace(/\.png$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return name || fileName;
}

/** ステージIDから選択画面向けの表示ラベルを返す。 */
export function stageLabelForId(stageId: string | null | undefined): string {
  return stageDisplayLabel(stageForId(stageId));
}
