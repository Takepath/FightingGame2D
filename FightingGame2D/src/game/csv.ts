/**
 * ゲームデータ用CSVを解析する関数
 * - ダブルクォーテーションで囲まれたセルに対応
 * - セル内のカンマ・改行を正しく扱う
 * - 連続する "" はエスケープされた " として扱う
 */
export function parseCsv(source: string): string[][] {
  // 読み込んだ全行を格納する配列
  const rows: string[][] = [];

  // 現在処理中の1行
  let row: string[] = [];

  // 現在処理中のセルの内容
  let cell = "";

  // ダブルクォーテーション内を読み込み中かどうか
  let quoted = false;

  // CSV文字列を1文字ずつ解析
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    // "" はエスケープされたダブルクォーテーションとして扱う
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;

<<<<<<< HEAD
      // ダブルクォーテーション開始・終了を切り替える
    } else if (char === '"') {
      quoted = !quoted;

      // クォーテーション外のカンマはセル区切り
=======
    // ダブルクォーテーション開始・終了を切り替える
    } else if (char === '"') {
      quoted = !quoted;

    // クォーテーション外のカンマはセル区切り
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";

<<<<<<< HEAD
      // クォーテーション外の改行は行区切り
    } else if ((char === "\n" || char === "\r") && !quoted) {
=======
    // クォーテーション外の改行は行区切り
    } else if ((char === "\n" || char === "\r") && !quoted) {

>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
      // Windows形式(CRLF)の改行に対応
      if (char === "\r" && next === "\n") index += 1;

      // 最後のセルを追加
      row.push(cell.trim());

      // 空行でなければ結果へ追加
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      // 次の行の読み込み準備
      row = [];
      cell = "";

<<<<<<< HEAD
      // 通常文字は現在のセルへ追加
=======
    // 通常文字は現在のセルへ追加
>>>>>>> 1e49edfbceaf77a62719f3201835a46a31c1131c
    } else {
      cell += char;
    }
  }

  // ファイル末尾のセル・行を追加
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

/**
 * CSVをヘッダー付きレコード配列へ変換する関数
 *
 * 例:
 * id,name
 * 1,Alice
 *
 * ↓
 * [
 *   { id: "1", name: "Alice" }
 * ]
 */
export function csvRecords(source: string): Record<string, string>[] {
  // CSVを二次元配列へ変換し、1行目をヘッダーとして取得
  const [header, ...rows] = parseCsv(source);

  // ヘッダーが存在しない場合は空配列を返す
  if (!header) return [];

  // 各行を「ヘッダー名: 値」のオブジェクトへ変換
  return rows.map((row) =>
    Object.fromEntries(
      header.map((name, index) => [
        // 値が不足している場合は空文字を設定
        name,
        row[index] ?? "",
      ]),
    ),
  );
}
