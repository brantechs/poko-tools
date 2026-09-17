# poko-tools

星乃ぽこの配信向けHTMLツール集。BOOTH で配布し、公式サイト(hoshino-poko.com)から案内する。

- 公式サイト本体は別 repo(`brantechs/wp-poko`)
- 配信アプリ Pokocast は別 repo

## 役割

| 担当 | やること | 置き場所 |
|---|---|---|
| 星乃ぽこ | 仕様・ワイヤーフレーム・デザイン | `docs/requirements/`, `docs/ux/` |
| ぶらんち | 実装・配布パッケージ・ホスティング | `tools/`, `scripts/`, `packaging/` |

## ツール一覧

`docs/product/lineup.md` を参照。

## 配布zipを作る

```bash
scripts/package-tool.sh roulette
```

`dist/` に出力される(git管理外)。

## 開発ルール

`AGENTS.md` と `docs/development/conventions.md` を必ず読むこと。
