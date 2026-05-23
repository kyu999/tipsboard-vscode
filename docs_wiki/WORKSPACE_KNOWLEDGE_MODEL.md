# Tipsboard VS Code Workspace Knowledge Model

## この文書について

この文書は、Tipsboard for VS Code で検討中の「workspace folder を基点にした知識ワークスペース」仕様をまとめる。

対象は VS Code 版のみである。デスクトップ版 Editor とのデータ互換や既存の `pages/` フラット構造は、この検討では前提にしない。

この仕様の目的は、ユーザーが VS Code で開いているドキュメント用 workspace folder を Tipsboard の知識ワークスペースとして扱い、既存の階層構造を保ったまま Markdown 文書を利用できるようにすることである。

---

## 1. 基本方針

Tipsboard VS Code 版は、ユーザーが VS Code で開いているドキュメント用 workspace folder を作業の基点とし、その配下の Markdown ファイルを知識ワークスペースとして扱う。

Tipsboard は、フォルダ構造を置き換えたり、専用の `pages/` ディレクトリへ集約したりしない。既存のファイルシステム上の階層を、そのまま主要な整理構造として読む。

例:

```text
knowledge/
  docs/
    auth/
      jwt.md
      oauth.md
    security/
      threat-model.md
  adr/
    0001-record-architecture-decisions.md
  meeting-notes/
  Unsorted/
```

この場合、VS Code では repository root ではなく `knowledge/` のようなドキュメント用フォルダを開く。Tipsboard は `knowledge/` 配下の Markdown ファイルを scan し、`docs/`、`adr/`、`meeting-notes/` などの既存フォルダ階層をそのまま知識ワークスペースの整理構造として扱う。

Tipsboard は、workspace folder 配下の Markdown ファイルの上に以下の知識レイヤーを構築する。

- ノート一覧
- フォルダ階層
- 内部リンク
- バックリンク
- タグ
- 関連ノート
- セマンティック検索用 metadata
- 未整理ノートの整理候補

Markdown ファイルそのものが source of truth であり、Tipsboard の index はキャッシュとして扱う。

---

## 2. Workspace と Scan Scope

Workspace root は、ユーザーが VS Code で開いているフォルダである。Tipsboard では、開発 repository の root ではなく、ノートやドキュメントを置くためのフォルダを開く運用を基本とする。

Tipsboard は、workspace root 配下の Markdown ファイルを scan 対象にする。ユーザーに複数の document folders を選択させる UI は持たない。

例:

```text
knowledge/
  docs/
  adr/
  meeting-notes/
  Unsorted/
```

Tipsboard は、workspace root 全体から Markdown ファイルを検出する。ユーザーが repository root を開くことも技術的には可能だが、`README` など同名・同用途の Markdown が大量に混在しやすく、ノートとして扱う範囲が曖昧になりやすい。そのため、初期仕様ではドキュメント用フォルダを VS Code で直接開く運用を推奨する。

初期仕様では、少なくとも以下を scan 対象から除外する。

- `.tipsboard/`
- `.git/`
- `node_modules/`
- `dist/`
- `build/`
- `out/`

左サイドバーのフォルダ指定アイコンは不要とする。Tipsboard の入口は、VS Code で現在開いている workspace folder に対して開く。

初期仕様では、VS Code の multi-root workspace は扱わない。workspace folder が複数ある場合は、Tipsboard の対象を自動的に決めず、単一フォルダを開くように案内する。

将来的に必要になった場合は、以下を追加で検討する。

- `.tipsboardignore`
- `.gitignore` の尊重
- 設定による scan 対象 include / exclude

---

## 3. 起動時 Scan と Index

Tipsboard 起動時、workspace root 配下の Markdown ファイルを scan し、workspace index を作る。

Index は以下を持つ。

- workspace 相対パス
- フォルダ階層
- タイトル
- 本文
- 見出し
- 内部リンク
- バックリンク
- タグ
- 更新時刻
- セマンティック検索用チャンク情報

Tipsboard 内で作成・保存・移動・削除したファイルは、即時 index に反映する。

外部ツールで作成・変更・削除された Markdown ファイルも、workspace watcher により通常の変更として検知し、index に反映する。

起動時 scan は、既存の階層構造を持つフォルダから index を作るために必要である。その後は、新規ファイル、変更、削除を監視して index を更新する。

更新の取りこぼしや watcher の一時停止が疑われる場合に備えて、手動 refresh も提供する。

---

## 4. ノートタイトル

ノートタイトルは、現行 Tipsboard と同様に本文先頭行から取得する。

ファイル名やフォルダ名は配置情報として扱うが、内部リンクの記述形式には含めない。

ノートタイトルは、workspace root 配下で重複しうる。既存の階層構造を持つ Markdown フォルダでは、`README`、`Overview`、`Index` のような一般的なタイトルが複数存在することが自然にありえるためである。

Tipsboard は重複タイトルを許容する。ただし、同じタイトルを持つノートが複数存在する場合、`[Title]` 内部リンクは一意に自動解決できない。

重複タイトルがある場合、ノート一覧や検索結果では、タイトルに加えて workspace 相対パスを表示して区別する。

---

## 5. 新規ノートと Unsorted

新規ノートは、まず workspace root 直下の `Unsorted/` に作成する。

例:

```text
knowledge/
  Unsorted/
    oauth-token-rotation.md
```

目的は、ノート作成時に保存先を決める負担を減らすことである。

ユーザーは後から、Tipsboard の整理提案を見ながら適切なフォルダへ移動できる。

将来的には、既存のフォルダ構造、近傍ノート、リンク、タグ、本文内容などから、そのノートがどのフォルダにあるべきかを自動判定する。ただし、実際のファイル移動はユーザーの承認後に行う。

`Unsorted/` の場所は、初期仕様では workspace root 直下に固定でよい。将来的に必要になった場合は、inbox path を設定可能にする。

ただし、workspace root 直下に既存の `Unsorted/` があり、それを Tipsboard の未整理ノート置き場として安全に使えるとは限らない。
初期仕様では、`Unsorted/` が存在しない場合は Tipsboard が作成する。すでに存在する場合は Markdown ノート置き場として利用可能かを確認し、衝突が疑われる場合は `Tipsboard Unsorted/` のような Tipsboard 用であることが分かるフォルダ名へフォールバックする。
フォールバック先も衝突する場合は、`Tipsboard Unsorted 2/` のように番号を付けて一意化する。

---

## 6. Tipsboard 内部リンク

Tipsboard の内部リンクは、タイトルを基準に解決する。

たとえば、本文中の以下のリンクは、タイトルが `OAuth` のノートへ解決する。

```md
[OAuth]
```

この表記は、Tipsboard の編集・表示文脈では Tipsboard 内部リンクとして解釈する。

ノート本文に書く内部リンクには、フォルダ階層やファイルパスを含めない。これまで通り `[Title]` の形式で書く。

リンク候補が一意に決まる場合は、そのノートへ直接遷移する。

同じタイトルを持つノートが複数存在する場合は、リンク遷移時に候補選択 UI を表示し、ユーザーがどのノートへ移動するかを選ぶ。

候補選択 UI では、少なくとも以下を表示する。

- タイトル
- workspace 相対パス
- 更新時刻
- 本文冒頭または見出しなどの短い preview

このため、ノートを別フォルダへ移動しても、タイトルが変わらない限り Tipsboard 内部リンクの記述は変わらない。ただし、重複タイトルがある場合は遷移時の選択が必要になる。

---

## 7. Markdown Link から Tipsboard Link への変換

通常の Markdown ファイルリンクは、ファイル移動によって壊れやすい。

例:

```md
[OAuth](../auth/oauth.md)
```

Tipsboard では、workspace root 内 Markdown ファイルへの通常リンクを、タイトルベースの Tipsboard 内部リンクへ変換する機能を検討する。

変換例:

```md
[OAuth](../auth/oauth.md)
```

変換後:

```md
[OAuth]
```

変換対象は、初期仕様では以下を満たすものに限定する。

- リンク先が workspace root 内にある
- リンク先が Markdown ファイルである
- リンク先ノートの本文先頭行からタイトルを取得できる

以下は変換対象外とする。

- 外部 URL
- 画像リンク
- 添付ファイルリンク
- 同一ページ内アンカー
- workspace root 外へのリンク

変換は自動では行わない。ユーザーが明示的に実行する。

変換後の `[Title]` が複数候補に解決される可能性は許容する。変換 UI では、変換後に同名タイトルが何件存在するかを表示し、必要であればユーザーが変換を見送れるようにする。

初期実装では、まず現在のノート内の変換候補を検出し、プレビュー後に変換する形がよい。将来的には workspace 全体の変換候補検出も検討する。

---

## 8. セマンティック検索

セマンティック検索は、従来の `pages/*.md` ではなく、workspace root 配下の Markdown ファイルを対象にする。

検索 index には本文だけでなく、パスやフォルダ階層も context として含める。

例:

```text
docs/auth/oauth.md
```

この場合、`docs`、`auth`、`oauth` というパス要素も検索上の手がかりとして扱う。

これにより、本文に明示されていない分類情報も検索や関連ノート推定に利用できる。

---

## 9. AI Assisted Organization

Tipsboard は、workspace root の `Unsorted/` 内のノートに対して移動先候補を提案する。

提案には以下を利用する。

- 内部リンク
- バックリンク
- タグ
- 見出し
- セマンティック類似度
- 既存フォルダ構造
- 近傍ノート

例:

```text
oauth-token-rotation.md

Suggested destinations:
1. docs/auth/      82%
2. docs/security/  71%
3. adr/            48%
```

Tipsboard は、ユーザーの承認なしにファイルを移動しない。

提案には理由を表示する。

例:

```text
Suggested: docs/auth/

Reasons:
- linked to OAuth
- shares tags with JWT
- similar headings detected
- related notes already exist under docs/auth/
```

初期仕様では、提案は workspace root の `Unsorted/` 内のノートに限定する。既存フォルダ内のノートを勝手に再配置候補として扱うことはしない。

---

## 10. ファイル移動

ファイル移動は、ユーザーが明示的に承認した場合のみ行う。

Tipsboard 内部リンクはタイトルベースで解決するため、ノート移動によって壊れにくい。

通常の Markdown 相対リンクは移動によって壊れる可能性があるため、必要に応じて Tipsboard link への変換機能を使う。

ファイル移動後、Tipsboard は workspace index を更新する。

---

## 11. 段階導入

### Phase 1: Workspace Scan

- VS Code で開いているドキュメント用 workspace folder を基点にする
- ユーザーに document folders を選択させない
- 左サイドバーのフォルダ指定アイコンは設けない
- workspace root 配下の Markdown を階層込みで scan する
- 基本的な除外ディレクトリを scan 対象から除外する
- タイトルを本文先頭行から取得する
- 重複タイトルを index 上で保持できるようにする
- 起動時 scan、watcher による更新、手動 refresh を提供する
- Tipsboard 内の作成・保存・移動・削除は index に即時反映する

### Phase 2: Title-Based Link Resolution

- Tipsboard 内部リンクを title で解決する
- フォルダ移動後も title が同じならリンクを維持する
- 重複タイトルに起因する曖昧なリンクでは、遷移時に候補選択 UI を表示する
- 通常 Markdown file link から Tipsboard link への変換機能を追加する

### Phase 3: Semantic Search for Workspace Markdown

- セマンティック検索対象を workspace root 配下 Markdown に広げる
- パス要素やフォルダ階層を検索 context に含める
- watcher と手動 refresh を併用して index を管理する

### Phase 4: Unsorted Organization Suggestions

- 新規ノートを workspace root の `Unsorted/` に作成する
- workspace root の `Unsorted/` 内ノートに移動先候補を出す
- 提案理由を表示する
- ユーザー承認時のみファイルを移動する

---

## 12. 非目標

初期仕様では、以下を目標にしない。

- Markdown 以外のソースコードや生成物まで含めた知識ベース化
- ユーザーが複数の document folders を手動選択する UI
- VS Code multi-root workspace
- workspace 外フォルダを混ぜること
- repository root をそのまま知識ワークスペースとして推奨すること
- 重複タイトルの自動解消
- ユーザー承認なしの自動ファイル移動
- 通常 Markdown 相対リンクの完全自動修復
- `Unsorted/` の高度な設定
- 複雑な ignore 仕様

---

## 13. まとめ

この仕様における Tipsboard VS Code 版は、Standalone Note App ではなく、VS Code workspace folder の上に乗る Workspace Knowledge Layer である。

ユーザーはドキュメント用フォルダを VS Code で開くだけで、既存の階層構造を保ったまま、ノート一覧、リンク、バックリンク、検索、セマンティック検索、整理提案を利用できる。

初期実装では、対象を「VS Code で開いている単一 workspace folder」に限定し、フォルダ選択 UI や設定を増やしすぎず、シンプルな体験を優先する。
