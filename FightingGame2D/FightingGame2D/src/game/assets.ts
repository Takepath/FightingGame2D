/** public配下の相対パスを、Viteのbase設定を反映した公開URLへ変換する。 */
export function gameAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}
