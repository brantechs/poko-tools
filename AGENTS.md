# AGENTS.md

コーディングエージェント向けの作業ルール。

## 必読
- `docs/development/conventions.md` (file:// 制約と OBS 前提)
- 対象ツールの `docs/requirements/<tool>.md` と `docs/ux/<tool>/`

## 守ること
- 配布物は **zip を解凍して index.html をダブルクリックで動く** こと。
  - `<script type="module">`、`fetch()`、CDN、外部フォント読み込みは使わない
  - 保存は `localStorage` のみ
- 1ツール = `tools/<tool>/` に閉じる。ツール間でファイルを参照しない(共通化は3ツール揃ってから)
- 素材(画像・音声・フォント)を追加したら `tools/<tool>/CREDITS.md` に出典と再配布可否を書く。再配布不可の素材は同梱しない
- 変更したら `tools/<tool>/tool.json` の version と `CHANGELOG.md` を更新する
- 1 ticket = 1 branch = 1 commit
