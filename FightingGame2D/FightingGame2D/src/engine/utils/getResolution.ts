/**
 * 表示の鮮明さとGPU負荷を両立する描画倍率を返す。
 * 通常ディスプレイでの不要な2倍描画を避け、高DPI環境も最大2倍へ制限する。
 */
export function getResolution(): number {
  const deviceResolution = Math.floor(window.devicePixelRatio || 1);
  return Math.min(2, Math.max(1, deviceResolution));
}
