# キャラクター選択用PNGアイコン

このフォルダへPNG画像を置き、`characters.csv` の `icon_asset` 列に公開パスを設定します。

例:

```csv
id,name,icon_asset
hero,HERO,data/icons/hero.png
```

画像はカード内で円形にトリミングして表示されます。`icon_asset` が空、または画像を読めない場合は既定の顔アイコンを表示します。
