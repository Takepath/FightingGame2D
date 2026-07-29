# Frame Fighters

Google Chromeで動く、ローカル2人対戦用の2D格闘ゲームです。PixiJSが描画を担い、対戦ロジックは描画フレームから切り離した60Hz固定ステップで動作します。

## 起動

```powershell
cd F:\FightingGame\FightingGame2D
npm install
npm run dev
```

表示されたURLをGoogle Chromeで開いてください。`file:///` で直接 `index.html` を開くのではなく、ViteなどのHTTPサーバー経由で起動します。製品ビルドは `npm run build` で `dist/` に生成されます。

別ブラウザ（同一PCまたはLAN上の別PC）で対戦する場合は、次でゲームサーバーとViteを同時に起動します。

```powershell
npm run multiplayer
```

ホストPCのWindowsファイアウォールで `5173` と `8787` の受信を許可し、対戦相手は `http://ホストPCのLAN-IP:5173` を開いてください。

## 操作

| Player 1 | Player 2 | Xbox コントローラー |
| --- | --- | --- |
| `A / D` 移動、`W` ジャンプ、`F / G / H` 攻撃、`Q` ガード | `← / →` 移動、`↑` ジャンプ、`Num 1 / 2 / 3` 攻撃、`Num 0` ガード | 左スティック/Dパッド、A=弱、X=強、B=必殺、RB=ガード |

接続順で、1台目のXboxゲームパッドがPlayer 1、2台目がPlayer 2です。ゲーム画面上部の `SYNC` はシミュレーションフレーム番号と状態チェックサムです。

波動拳は、相手方向へ `↓` → `↓＋前` → `前＋H`（Player 2は `Num 3`）で発射します。ジャンプ開始時の左右入力と空中入力には慣性が乗ります。

## オンライン対戦

画面右上の `ONLINE ROOM` から4〜32文字の合言葉で部屋を作成し、相手が同じ合言葉で「部屋に参加」を選ぶと対戦を開始します。オンライン中は両ブラウザともPlayer 1用の操作（`WASD / FGHQ` または1台目のXboxゲームパッド）を使います。

送受信するのはフレーム番号付きの入力ビットだけです。両者の同一フレーム入力が揃うまでシミュレーションを進めないロックステップ方式のため、各端末で同じ状態チェックサムになります。ルームはメモリ上のみで、ホストまたは参加者が切断すると対戦を終了します。合言葉はLAN向けの簡易照合であり、公開インターネットでの秘匿用パスワードではありません。

## 実装要件

- 描画Tickerを最大60FPSに制限し、ゲームロジックは常に `1000 / 60ms` の固定ステップで実行します。
- 各ステップの入力をビットフラグのスナップショットとして保存してからシミュレーションします。入力履歴は10秒保持され、同じフレーム入力列なら同じ状態になるため、リプレイ・ロールバック・ネットワーク同期を追加できる構造です。
- `public/data/characters.csv` がキャラクター、`public/data/moves.csv` が技の開始・持続・硬直・ダメージ・リーチ等を管理します。起動時にCSVを読み込みます。
- `blender_hero` はBlender骨格JSONを再生します。`stick_rival` は、アニメーション素材がなくても遊べるプログラム描画の棒人間です。

## Blenderアニメーションの追加

Webブラウザーは `.blend` を直接再生できないため、同梱の [blender_export_fighting_animation.py](tools/blender_export_fighting_animation.py) でBlenderのArmature Actionを、ゲームがフレーム単位で再生できるJSONへ書き出します。

```powershell
blender --background Fighter.blend --python tools/blender_export_fighting_animation.py -- --armature Armature --output public/data/animations/my_fighter.json
```

Blender側では正面視点を `X=横、Z=縦` とし、Action名を `idle`、`walk`、`jump`、`light`、`heavy`、`special`、`hit`、`block`、`ko` にします。別名を使う場合は `moves.csv` の `animation` 列と合わせてください。書き出したパスを `characters.csv` の `animation_asset` 列に設定すると、棒人間へフォールバックせず骨格アニメーションが再生されます。
