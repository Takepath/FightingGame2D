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

  // Excel等が付与するUTF-8 BOMは先頭列名へ含めず、そのまま読み込めるようにする。
  const firstCharacterIndex = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  // CSV文字列を1文字ずつ解析
  for (let index = firstCharacterIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    // "" はエスケープされたダブルクォーテーションとして扱う
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;

      // ダブルクォーテーション開始・終了を切り替える
    } else if (char === '"') {
      quoted = !quoted;

      // クォーテーション外のカンマはセル区切り
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";

      // クォーテーション外の改行は行区切り
    } else if ((char === "\n" || char === "\r") && !quoted) {
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

      // 通常文字は現在のセルへ追加
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw new Error("CSVのダブルクォートが閉じられていません");
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
export interface CsvRecordOptions {
  /** エラーへ表示するファイル名。 */
  readonly fileName?: string;
  /** 読み込み処理が必要とする列名。列順は問わない。 */
  readonly requiredHeaders?: readonly string[];
}

export function csvRecords(
  source: string,
  options: CsvRecordOptions = {},
): Record<string, string>[] {
  // CSVを二次元配列へ変換し、1行目をヘッダーとして取得
  const [header, ...rows] = parseCsv(source);
  const fileName = options.fileName ?? "CSV";

  // 必須列を指定したゲームデータでは、空ファイルを有効な0件CSVとして扱わない。
  if (!header) {
    if ((options.requiredHeaders?.length ?? 0) > 0) {
      throw new Error(`${fileName} にヘッダー行がありません`);
    }
    return [];
  }

  const emptyHeaderIndex = header.findIndex((name) => name.length === 0);
  if (emptyHeaderIndex >= 0) {
    throw new Error(
      `${fileName} の${emptyHeaderIndex + 1}列目に列名がありません`,
    );
  }
  if (new Set(header).size !== header.length) {
    throw new Error(`${fileName} の列名は重複なしで定義してください`);
  }
  const missingHeaders = (options.requiredHeaders ?? []).filter(
    (name) => !header.includes(name),
  );
  if (missingHeaders.length > 0) {
    throw new Error(
      `${fileName} に必要な列がありません: ${missingHeaders.join(", ")}`,
    );
  }

  rows.forEach((row, index) => {
    if (row.length > header.length) {
      throw new Error(
        `${fileName} の${index + 2}行目にヘッダーより多い値があります`,
      );
    }
  });

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
