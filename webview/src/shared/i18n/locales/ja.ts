const ja = {
  common: {
    untitled: "無題",
    cancel: "キャンセル",
  },
  layout: {
    userGuide: "ユーザーガイド",
    settings: "ローカル設定",
    newPage: "新規メモ",
    changeFolder: "フォルダ変更",
    importJson: "Import JSON",
    exportJson: "Export JSON",
    cardView: "カード表示",
    kanban: "KANBAN",
    activityBar: "メインナビゲーション",
    currentVault: "Vault フォルダ",
    shortcutCards: "Ctrl+Shift+L / ⌘⇧L",
    shortcutKanban: "Ctrl+Shift+K / ⌘⇧K",
    shortcutBack: "Alt+← · ⌘[ · Ctrl+[",
    shortcutNewNote: "Tipsboard 表示中: Ctrl+N / ⌘N",
  },
  onboarding: {
    eyebrow: "Tipsboard",
    title: "ローカルメモを始める",
    description:
      "Web版と同じ見た目のMarkdownワークスペースとして使うフォルダを選んでください。既存の `.md` ファイルもそのまま読み込みます。",
    selectFolder: "フォルダを選択",
  },
  search: {
    placeholder: "ページを検索…",
    noResults: "検索結果はありません",
  },
  settings: {
    sections: {
      language: "言語",
    },
    language: {
      label: "表示言語",
      helper: "選択した言語はこのアプリに保存されます。",
    },
  },
  page: {
    userGuide: {
      closeGuide: "ガイドを閉じる",
    },
    list: {
      emptyTitle: "まだページがありません",
      emptyDescription:
        "{{shortcut}}で新規、{{shortcutCards}}でカード、{{shortcutKanban}}でKANBAN、{{shortcutBack}}で直前の画面へ。下の「{{newPage}}」でも作成できます。",
      searchEmptyTitle: "該当するページはありません",
      searchEmptyDescription: "別のキーワードを試すか、検索を解除してすべてのノートを表示できます。",
      clearSearch: "検索を解除",
    },
    editor: {
      deleteConfirm: "「{{title}}」を削除しますか？",
      discardUnsavedTitle: "未保存の変更があります",
      discardUnsavedConfirm: "未保存の変更があります。保存せずに移動しますか？",
      discardUnsaved: "保存せずに移動",
      backToList: "一覧へ戻る",
      pinNote: "ピン留め",
      unpinNote: "ピンを外す",
      stickyNav: "メモのクイック操作",
      delete: "削除",
      exportHtml: "HTMLをエクスポート",
      exportHtmlHint:
        "エディタ上の現在の本文を保存（未保存の変更を含む）。画像は Vault 内のファイルを参照します。Vault の場所を変えると HTML 内の画像リンクは切れる場合があります。PDF はブラウザの印刷機能で出力できます。",
      exportHtmlError: "HTMLのエクスポートに失敗しました",
      kanbanStatus: "KANBANの所属ボードと状態",
      rewriteInboundLinksTitle: "内部リンク表記を更新しますか",
      rewriteInboundLinksMessage:
        "タイトルが「{{oldTitle}}」から「{{newTitle}}」に変わりました。{{count}}件のノートに、旧タイトルを指す内部リンク `[ … ]` があります。このまますべて新タイトル表記へ書き換えますか。",
      rewriteInboundLinksConfirm: "書き換える",
    },
  },
  kanban: {
    board: "KANBANボード",
    noBoard: "ボードなし",
    tagLegend: "タグ色",
    clearTagFilters: "絞り込み解除",
    deleteBoardConfirm: "このKANBANボードを削除しますか？ メモ本文は変更されません。",
    deleteColumnConfirm: "この列を削除しますか？ この列のカードはボードから外れます。",
    removeCardConfirm: "このカードをボードから外しますか？ メモ本文は削除されません。",
    actions: {
      newBoard: "ボード作成",
      renameBoard: "ボード名変更",
      deleteBoard: "ボード削除",
      newColumn: "列追加",
      addAnotherColumn: "もう1つ列を追加",
      renameColumn: "名前変更",
      deleteColumn: "削除",
      newCard: "カード作成",
      removeCard: "ボードから外す",
      addExisting: "既存メモを追加",
      boardMenu: "ボードメニュー",
      columnMenu: "列メニュー",
    },
    prompts: {
      boardName: "ボード名",
      columnName: "列名",
      cardTitle: "新しいカードのメモタイトル",
    },
    createBoard: {
      title: "新しいボード",
      description: "ボード名を入力してください。",
      name: "ボード名",
      create: "作成",
    },
    empty: {
      title: "KANBANボードがありません",
      description: "ボードを作ると、既存メモや新規メモをカードとして状態管理できます。",
    },
    emptyColumns: {
      title: "まだ列がありません",
      description: "まず列を追加してください。列を作ると、既存メモや新規メモをカードとして追加できます。",
    },
    existing: {
      title: "既存メモをカードに追加",
      description: "メモ本文は変更せず、KANBAN側の状態だけを作成します。",
      close: "閉じる",
      quickSearchPlaceholder: "既存メモを検索してカード追加…",
      searchPlaceholder: "タイトル、タグ、本文プレビューで検索…",
      destination: "追加先",
      empty: "追加できるメモはありません",
      noTags: "タグなし",
      selected: "{{count}}件選択中",
      addSelected: "選択したメモを追加",
    },
  },
  links: {
    links: "Links",
    newLinks: "New Links",
    twoHop: "2ホップリンク",
    via: "リンク先",
  },
  saveStatus: {
    unsaved: "未保存",
    saving: "保存中…",
    saved: "保存済み",
    error: "保存に失敗しました",
  },
  sync: {
    externalChangesPending:
      "このノートが別の場所で変更されました。再読み込みする前に未保存の編集を確認してください。",
    reload: "更新",
  },
  editor: {
    clickToEnlargeImage: "クリックで拡大 · ホイール・トラックパッドまたは ± キーでズーム",
    fileTooLarge: "ファイルが大きすぎます（最大10MB）",
    importFailed: "画像の取り込みに失敗しました",
  },
} as const;

export default ja;
