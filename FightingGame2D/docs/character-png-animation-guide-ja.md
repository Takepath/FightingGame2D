# 連番PNGからキャラクターと技を追加するガイド

このガイドは、2D格闘ゲーム **Frame Fighters** に新しいキャラクターを追加するための外部公開用手順です。連番PNGの作成、ゲームに使う画像の配置、アニメーションJSON・キャラクターCSV・技CSV・コマンドCSVの登録、動作確認までを扱います。

> [!IMPORTANT]
> `public/data/characters/<character-id>/<state>/` 内のPNG連番は、**1枚を60FPSの1ゲームフレームとして直接再生**します。状態フォルダがない、またはPNGが1枚もない場合だけ、JSONで指定した単体PNGに `x`・`y`・`rotation`・`scale` を適用する方式へなります。JSONは連番PNG方式でも、共通の表示倍率・足元アンカー・名前位置・フォールバック画像を定義するために必要です。

## 1. 完成イメージと作業の流れ

```text
状態ごとにPNGを連番で書き出す
  ↓
public/data/characters/<character-id>/<state>/ に配置
  ↓
フォールバック用単体PNGとJSONを用意する
  ↓
characters.csv にキャラクターを1行追加
  ↓
moves.csv に固有技を追加
  ↓
（必要なら）commands.csv にコマンドを追加
  ↓
ゲーム起動・対戦画面・ビルドで確認
```

以下では、キャラクターIDを `river_guard`、表示名を `RIVER GUARD` として説明します。英数字とアンダースコアだけで構成した、重複しない小文字IDを使ってください。

## 2. 事前準備

### 必要なもの

- Node.jsとnpm
- 透過PNGを書き出せる画像編集ソフトまたはBlender
- テキストエディター（CSV・JSON編集用）
- Google Chrome

プロジェクトのルートで依存関係を入れ、開発サーバーを起動します。

```powershell
cd F:\FightingGame\FightingGame2D
npm install
npm run dev
```

起動前・公開前には、次の確認も行います。

```powershell
npm run build
git diff --check
```

`npm run build` が成功しない状態では、アセットやCSVを外部公開用の完成版として配布しないでください。

## 3. 連番PNGを作る

### 3.1 必須アクション

ゲームで利用できるアクション名は次のとおりです。使用しないアクションは `idle` のポーズへフォールバックしますが、最低でも `idle`・`walk`・`jump`・`light`・`heavy`・`special` を用意することを推奨します。

| アクション    | 用途                              |
| ------------- | --------------------------------- |
| `idle`        | 待機                              |
| `walk`        | 前後歩き                          |
| `jump`        | ジャンプ                          |
| `light`       | 弱攻撃                            |
| `heavy`       | 強攻撃                            |
| `special`     | 必殺技                            |
| `hit`         | 被弾                              |
| `block`       | 立ちガード                        |
| `crouchBlock` | しゃがみガード（省略時は`block`） |
| `ko`          | KO                                |

### 3.2 推奨するファイル構成
連番PNGは、同じキャンバスサイズ・同じ解像度・同じ足元位置で書き出します。例えば1024×1024pxを使う場合は、すべての画像で靴底または足先を同じY座標にそろえます。

```text
public/data/characters/river_guard/
├─ fallback.png
├─ icon.png
├─ idle/
│  ├─ 000.png
│  ├─ 001.png
│  ├─ 002.png
│  └─ 003.png
├─ walk/
│  ├─ 000.png
│  ├─ 001.png
│  ├─ 002.png
│  └─ 003.png
├─ jump/
│  └─ 000.png
├─ light/
│  ├─ 000.png
│  └─ 001.png
├─ heavy/
│  ├─ 000.png
│  └─ 001.png
└─ special/
   └─ 000.png
```

フォルダ名は `characters.csv` の `id` と状態名に完全一致させます。ファイル名の連番は、`000.png`、`001.png`、`002.png` のように桁数をそろえます。開発サーバー起動時・製品ビルド時にゲームが自動でPNGを走査し、自然順で再生するため、マニフェストの作成は不要です。

- `idle`・`walk`・`block`・`crouchBlock` は先頭へ戻ってループします。
- `jump`・`light`・`heavy`・`special`・`hit`・`ko` は最後のPNGで停止します。
- 状態フォルダがない、またはPNGが0枚なら、その**状態だけ**JSON単体画像方式へフォールバックします。`crouchBlock` のJSONポーズは、従来どおり `crouchBlock` → `block` → `idle` の順で補います。
- フォルダやPNGを開発中に追加・削除した場合は、開発サーバーが画面を再読込して一覧を更新します。

### 3.3 画像作成時のルール

- 背景は完全透過にします。白背景や半透明の背景レイヤーを残しません。
- すべてのフレームのキャンバス寸法を同じにします。
- 足元を同じ位置に固定します。ジャンプ中だけは上方向へ移動して構いません。
- キャラクターをキャンバスから切らないよう、頭・武器・尻尾・エフェクトに余白を取ります。
- 左右反転はゲーム側で行うため、通常は右向きの素材だけを用意します。
- `icon.png` はキャラクター選択用です。正方形・透過PNGを推奨します。
- 他者が作った画像、生成画像、フォント、ロゴを公開する場合は、利用規約・ライセンス・クレジット要件を必ず確認します。

### 3.4 フォールバック用の単体PNGを用意する

`fallback.png` のような単体PNGを、状態フォルダの外へ1枚配置します。これは全状態のフォルダが未配置・空・読込失敗した時に使う画像です。

```text
public/data/characters/river_guard/fallback.png
```

状態別連番がある場合、画像自体にポーズを含めるためJSONのアクション別 `x`・`y`・`rotation`・`scale` は適用されません。フォルダがない状態だけ、これらのJSONポーズで単体PNGを拡大縮小・移動・回転します。

## 4. スプライトアニメーションJSONを作る

`public/data/animations/river_guard.json` を作成します。`asset` は `public` フォルダーを基準にしたパスです。Windowsのバックスラッシュではなく、必ず `/` を使います。

```json
{
  "format": "fightinggame2d-blender-sprite-v1",
  "fps": 60,
  "animations": {},
  "sprite": {
    "asset": "data/characters/river_guard/fallback.png",
    "scale": 0.18,
    "anchor": [0.5, 0.92],
    "nameplateY": -210,
    "frameDuration": 6,
    "animations": {
      "idle": [
        { "y": 0, "rotation": 0 },
        { "y": -2, "rotation": -0.01 },
        { "y": -4, "rotation": 0 },
        { "y": -2, "rotation": 0.01 }
      ],
      "walk": [
        { "x": -3, "y": -1, "rotation": -0.04, "scale": 0.99 },
        { "x": 2, "y": -4, "rotation": 0.02, "scale": 1.01 },
        { "x": 4, "y": -1, "rotation": 0.04, "scale": 0.99 },
        { "x": -1, "y": -4, "rotation": -0.02, "scale": 1.01 }
      ],
      "jump": [
        { "y": 2, "rotation": -0.08, "scale": 0.97 },
        { "y": -4, "rotation": 0.04, "scale": 1.03 }
      ],
      "light": [
        { "x": -8, "rotation": -0.1, "scale": 0.98 },
        { "x": 12, "rotation": 0.08, "scale": 1.04 }
      ],
      "heavy": [
        { "x": -14, "rotation": -0.16, "scale": 0.96 },
        { "x": 20, "rotation": 0.14, "scale": 1.08 }
      ],
      "special": [
        { "x": -16, "rotation": -0.18, "scale": 0.96 },
        { "x": 22, "rotation": 0.16, "scale": 1.1 }
      ],
      "hit": [{ "x": -12, "rotation": -0.12 }],
      "block": [{ "x": -3, "rotation": -0.06, "scale": 0.98 }],
      "crouchBlock": [{ "x": -2, "y": 18, "rotation": -0.04, "scale": 0.84 }],
      "ko": [{ "x": -14, "y": 16, "rotation": 1.1, "scale": 0.95 }]
    }
  }
}
```

### JSON項目

| 項目            | 内容                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `format`        | 現行スプライト形式は `fightinggame2d-blender-sprite-v1`                     |
| `fps`           | 必ず `60`。ゲームの固定シミュレーションと一致させます。                     |
| `asset`         | 状態別PNGがない時に使う、代表の透過PNGパス                                  |
| `scale`         | 元画像への表示倍率。大きすぎる・小さすぎる場合に調整します。                |
| `anchor`        | 画像の基準点。`[0.5, 0.92]` なら横中央・画像高の92%を足元として扱います。   |
| `nameplateY`    | キャラクター名のY座標。背が高いキャラクターほど小さい値（上方向）にします。 |
| `frameDuration` | JSON単体画像方式で、1ポーズを何フレーム表示するか。`6` は60FPSで10ポーズ/秒です。 |
| `x`, `y`        | JSON単体画像方式の基準位置からの移動量（ピクセル）。正のYは下方向です。     |
| `rotation`      | JSON単体画像方式の回転量（ラジアン）。右向き基準で設定し、左向きは自動反転されます。 |
| `scale`         | JSON単体画像方式のJSON全体 `scale` に掛ける倍率です。                       |

`crocodile_soldier.json` は、実装済みキャラクターの参照例です。

## 5. characters.csvにキャラクターを登録する

`public/data/characters.csv` の末尾に1行追加します。`render_type` を `blender` にすると、`animation_asset` のJSONを読み込み、同じ `id` の `public/data/characters/<id>/<state>/` を状態別PNGの配置先として自動参照します。

```csv
river_guard,RIVER GUARD,blender,data/animations/river_guard.json,data/characters/river_guard/icon.png,#4A9B73,#E9B949,10000,315,1880,64,168,20
```

列の意味は次のとおりです。

| 列                               | 内容                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `id`                             | 内部ID。英小文字・数字・アンダースコアを推奨。重複禁止。 |
| `name`                           | 対戦画面・選択画面に表示する名前。                       |
| `render_type`                    | 状態別PNG／JSONを使う場合は `blender`、棒人間は `stick`。 |
| `animation_asset`                | 共通表示設定と単体PNGフォールバックを持つJSONへの公開パス。 |
| `icon_asset`                     | 選択画面のアイコンPNGへの公開パス。                      |
| `primary_color` / `accent_color` | `#RRGGBB`形式の基本色・差し色。                          |
| `max_health`                     | 最大体力。`damage` と同じ実数HPポイントで指定します。    |
| `walk_speed`                     | 前歩き速度。                                             |
| `jump_velocity`                  | ジャンプ初速度。                                         |
| `hurtbox_width`                  | 被弾判定の横幅。                                         |
| `hurtbox_top`                    | 足元から頭側に伸びる被弾判定の高さ。                     |
| `hurtbox_bottom`                 | 足元側で判定を空ける余白。                               |

キャラクター数は2〜25体です。画像が大きくても、被弾判定は見た目に合わせて必ず調整してください。

## 6. 飛び道具の見た目をprojectiles.csvへ追加する

飛び道具技を作る場合は、技より先に`public/data/projectiles.csv`へ見た目IDを追加します。`hitbox_radius`は見た目と独立した命中判定半径で、この値だけは旧形式CSVでも列・値を省略でき、その場合は`gameConfig.ts`の共通値（既定14px）を使います。`spawn_offset_y`はキャラクター中心を基準にした出現位置、`target_opponent=true`は発射時点の相手の真上へ一度だけ出現させるメテオ型の設定です。`self_move_easing`では飛行中の横移動を一定・加速・減速・山なりに設定できます。

```csv
id,render_type,asset,width,height,spawn_offset_y,target_opponent,self_move_easing,hitbox_radius,outer_radius,middle_radius,core_radius,outer_color,middle_color,core_color
river_shot,circle,,52,52,0,false,linear,16,26,17,8,#45B8FF,#8CDEFF,#F4FCFF
```

PNGを表示する場合は`render_type=sprite`、`asset=data/projectiles/river_shot.png`のように指定します。画像はP1側と同じ右向き基準で用意してください。左向きに発射した場合はゲーム側で自動的に左右反転します。全列の意味は[CSV設定項目一覧](../public/data/CSV設定項目一覧.txt)を参照してください。

## 7. 固有技をmoves.csvへ追加する

`public/data/moves.csv` に固有技を追加します。同じ `move_id` の共通技（`character_id=all`）がある場合も、行順にかかわらずキャラクター固有行が優先されます。

ここでは主要列だけを説明します。`invincible_frames`、ガード時硬直・ノックバック、ゲージ、キャンセルなどを含む完全な一覧は[CSV設定項目一覧](../public/data/CSV設定項目一覧.txt)を参照してください。

```csv
character_id,move_id,button,startup,active,recovery,invincible_frames,damage,special_gauge_cost,super_gauge_cost,super_gauge_gain,guard_bleak,starter_proration,range_x,range_y,self_move_x,self_move_y,self_move_speed,self_move_easing,knockback_x,knockback_y,guard_knockback_x,guard_self_knockback_x,hitstun,guard_stun,animation,attack_type,projectile_speed,projectile_lifetime,use_state,attack_level,projectile_id,command_id,cancel_into
river_guard,river_shot,special,10,2,28,0,1100,10,0,15,false,0,0,0,0,0,0,linear,390,220,130,0,27,14,special,projectile,700,105,ground,mid,river_shot,river_shot,
```

`moves.csv` の主要列は次のとおりです。

| 列                                         | 内容                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `character_id`                             | この技を使えるキャラクターID。全員共通は `all`。                                                |
| `move_id`                                  | 技ID。キャラクター内で重複させません。                                                          |
| `button`                                   | `light`、`heavy`、`special`、`throw`。                                                          |
| `startup` / `active` / `recovery`          | 発生・持続・硬直。すべて60FPS固定フレームです。                                                 |
| `damage`                                   | ダメージ。`500` を指定すると500ダメージとなり、割合換算はしません。                             |
| `special_gauge_cost`                       | 必殺技ゲージの消費量。0〜100の整数で、残量不足時は技を出せません。                              |
| `super_gauge_cost`                         | 超必殺ゲージの消費量。0〜300の整数で、残量不足時は技を出せません。                              |
| `super_gauge_gain`                         | 超必殺ゲージの増加量。0〜300の整数で、相手にガードされず命中した時だけ加算されます。            |
| `guard_bleak`                              | `true` ならガードを貫通、`false` なら上中下属性に従ってガード可能。                             |
| `starter_proration`                        | 始動補正率。`20`なら120%、`-10`なら90%からコンボ減衰を開始します。                              |
| `range_x` / `range_y`                      | 近接技の前方リーチ・上下判定。                                                                  |
| `self_move_x` / `self_move_y`              | 自キャラ移動の横・縦方向の比率。正のXは前方、正のYは上方。                                      |
| `self_move_speed`                          | 自キャラ移動の基準速度（px/秒）。`0`なら移動しません。                                          |
| `self_move_easing`                         | `linear`（一定）・`accelerate`（加速）・`decelerate`（減速）・`arc`（山なり）の速度変化。       |
| `knockback_x` / `knockback_y`              | 命中時の横・縦方向の吹き飛び。                                                                  |
| `hitstun`                                  | 命中時の硬直フレーム。                                                                          |
| `animation`                                | JSONのアクション名。`light`・`heavy`・`special`など。                                           |
| `attack_type`                              | `melee` または `projectile`。                                                                   |
| `projectile_speed` / `projectile_lifetime` | 飛び道具の速度・生存フレーム。近接技は `0`。                                                    |
| `use_state`                                | `ground`、`air`、`any`。                                                                        |
| `attack_level`                             | `high`、`mid`、`low`。                                                                          |
| `command_id`                               | `commands.csv` のID。複数指定は `\|` 区切りで、いずれかの入力で発動。ボタンだけで出す技は空欄。 |

ガード属性は、`high` が立ちガードのみ、`low` がしゃがみガードのみ、`mid` が両方でガード可能です。ガード成功時のダメージは0です。

## 8. コマンド技を追加する（任意）

波動拳型の飛び道具などには、`public/data/commands.csv` を使います。テンキー表記の方向列を登録し、`moves.csv` の `command_id` から参照します。

```csv
command_id,sequence,max_frames,priority,charge_frames
river_shot,2>3>6,18,10,0
```

| テンキー表記 | 意味         |
| ------------ | ------------ |
| `6`          | 前           |
| `4`          | 後ろ         |
| `2`          | 下           |
| `8`          | 上           |
| `3`          | 下前         |
| `1`          | 下後ろ       |
| `5`          | ニュートラル |

前後方向はキャラクターの向きを基準に判定されます。自動振り向き後も同じ `2>3>6` を使えます。最後の方向入力から技ボタンまでは6フレームまで受け付けます。

## 9. ゲーム内で確認する

1. `npm run dev` を起動します。
2. Chromeで表示されたURLを開きます。
3. 「ローカル対戦」または「トレーニング」を選びます。
4. 追加したキャラクターを選択します。
5. VS画面で色とアイコンを確認します。
6. 対戦画面で待機・歩き・ジャンプ・弱・強・必殺技・被弾・KOを確認します。状態別PNGがある状態は、1枚ずつ60FPS固定で切り替わることを確認します。
7. 名前が頭部や相手キャラクターの名前と重なる場合は、JSONの `nameplateY` を小さくします。
8. 足が地面に接しない場合は、`anchor` のY値を調整します。値を小さくするとスプライトは下がり、大きくすると上がります。
9. 攻撃が見た目より遠い・近い場合は、`range_x`、`range_y`、`hurtbox_width`、`hurtbox_top`、`hurtbox_bottom` を調整します。

最後に製品ビルドを行います。

```powershell
npm run build
git diff --check
```

## 10. 外部公開前のチェックリスト

- [ ] すべてのPNGが透過背景で、余計な背景・ガイド線・透かしを含まない。
- [ ] PNGのキャンバスサイズと足元位置が統一されている。
- [ ] 使用した画像・Blender素材・生成画像の利用権とクレジット条件を確認した。
- [ ] `characters.csv` のIDに重複がない。
- [ ] `animation_asset` と `icon_asset` のパスが実在する。
- [ ] PNGフォルダ名がキャラクターID・対応済み状態名と完全一致し、各状態の連番が `000.png` から自然順に並ぶ。
- [ ] 状態別PNGを置かない状態でも、JSONの `asset` が単体PNGを指しておりフォールバックできる。
- [ ] `moves.csv` の `character_id` が `characters.csv` のIDと一致している。
- [ ] 飛び道具技の`projectile_id`が`projectiles.csv`のIDと一致している。
- [ ] `command_id` を使う場合、`commands.csv` に重複なしで定義されている。
- [ ] 待機・歩き・ジャンプ・攻撃・被弾・KOで見切れや名前の重なりがない。
- [ ] 地面・被弾判定・リーチが見た目と大きくずれていない。
- [ ] `npm run build` と `git diff --check` が成功する。

## 11. よくある問題

| 症状                             | 原因と解決                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 選択画面にアイコンが出ない       | `icon_asset` は `public` 配下からの相対パスです。拡張子・大文字小文字・`/`区切りを確認します。                                                          |
| 棒人間で表示される               | `render_type=blender`、`animation_asset` のパス、JSON構文、JSONの `asset` の単体PNGを確認します。状態別PNGだけが壊れている場合は棒人間ではなくJSON方式へ戻ります。 |
| 足が浮く・地面に埋まる           | 全フレームの足元をそろえ、JSONの `anchor[1]` を調整します。                                                                                             |
| 名前がキャラクターに重なる       | `nameplateY` をより小さい値にします。例: `-184` → `-220`。                                                                                              |
| 固有技ではなく共通技の性能になる | `moves.csv` の `character_id` と `move_id`、重複行がないかを確認します。                                                                                |
| コマンド技が出ない               | `commands.csv` の `command_id`、テンキー表記、`max_frames`、最後の方向入力から技ボタンまでが6フレーム以内か、`moves.csv` の `command_id` を確認します。 |
| 連番PNGが切り替わらない          | `public/data/characters/<characters.csvのid>/<state>/` の順になっているか、状態フォルダにPNGが1枚以上あるか、拡張子と大文字小文字を確認します。開発中に追加した場合は画面を再読込します。 |

## 付録: Blender Armatureを使う場合

BlenderのArmature Actionを骨格JSONとして出力する場合は、同梱のスクリプトを使います。

```powershell
blender --background Fighter.blend --python tools/blender_export_fighting_animation.py -- --armature Armature --output public/data/animations/river_guard.json
```

Blenderでは正面視点を `X=横、Z=縦` とし、Action名を `idle`、`walk`、`jump`、`light`、`heavy`、`special`、`hit`、`block`、`crouchBlock`、`ko` に合わせます。`crouchBlock`を省略した場合は`block`を再生します。Armature骨格JSONとPNGスプライトJSONは同じ `animation_asset` 列から読み込めます。PNGスプライトJSONを使う場合は、さらに `public/data/characters/<character-id>/<state>/` にPNG連番を置くと、その状態だけ連番再生が優先されます。
