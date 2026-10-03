# キャラクター選択用PNGアイコン

このフォルダへPNG画像を置き、`characters.csv` の `icon_asset` 列に公開パスを設定します。

CSVを3列だけの内容へ置き換えず、既存行の`icon_asset`セルだけを変更してください。完全な1行の例:

```csv
id,name,render_type,animation_asset,icon_asset,primary_color,accent_color,max_health,walk_speed,jump_velocity,hurtbox_width,hurtbox_top,hurtbox_bottom
hero,HERO,stick,,data/icons/hero.png,#4FD8FF,#FFC857,10000,330,1900,52,120,0
```

画像はカード内で円形にトリミングして表示されます。`icon_asset` が空、または画像を読めない場合は既定の顔アイコンを表示します。
