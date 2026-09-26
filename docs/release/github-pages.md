# GitHub Pages 公開

`main` ブランチのルートをそのまま GitHub Pages で公開する(2026-09-24 決定)。
**main にマージした時点で公開される** ので、未完成のものは main に入れない。

| 対象 | URL |
|---|---|
| 一覧 | https://brantechs.github.io/poko-tools/ |
| 名前ルーレット | https://brantechs.github.io/poko-tools/tools/roulette/ |

## 初回設定(devuser)
1. repo を public にする(Settings → General → Danger Zone → Change visibility)
2. Settings → Pages → Build and deployment: Source = Deploy from a branch、Branch = `main` / `/ (root)`
3. 数分後に上の URL が開けることを確認

- ルートの `.nojekyll` は Jekyll 変換を止めて、ファイルをそのまま配信するためのもの。消さない
- 公開サイトは誰でも開ける。中身は BOOTH の無料配布版と同じ

## OBS に設定する(ぽこ向け)
1. ソースの「+」→「ブラウザ」
2. 「ローカルファイル」のチェックを **外して**、URL 欄に上のツールの URL を貼る
3. 幅 1920 / 高さ 1080。効果音を配信に乗せるなら「OBSを介して音声を制御する」をオン
4. 操作パネルのクロップと「対話」での操作はローカルファイル版と同じ(`tools/roulette/MANUAL.md`)

- 名前や設定の保存先は、URL 版とローカルファイル版で別々。切り替えた時は入れ直す
- 更新は OBS のソースを右クリック →「プロパティ」→「現在のページのキャッシュを更新」
