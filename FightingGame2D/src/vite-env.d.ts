/// <reference types="vite/client" />
/** Viteとルームサーバーで共有する、合言葉長の起動設定。 */
declare const __ROOM_MIN_PASSPHRASE_LENGTH__: number;
declare const __ROOM_MAX_PASSPHRASE_LENGTH__: number;

/** Viteプラグインがpublic/data/characters配下から生成する状態別PNG一覧。 */
declare module "virtual:fighting-game-character-frames" {
  const manifest: Readonly<Record<string, Readonly<Record<string, string[]>>>>;
  export default manifest;
}

/** Viteプラグインがpublic/background直下から生成する背景PNG一覧。 */
declare module "virtual:fighting-game-backgrounds" {
  const manifest: readonly string[];
  export default manifest;
}
