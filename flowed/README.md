# Flowed TypeScript TODO アプリケーション

TypeScriptとFlowedフレームワークを使用したTODOアプリケーションのサンプル実装です。

## 概要

このプロジェクトは、Flowedフレームワークの並行プログラミングと依存関係制御機能を活用したTODOアプリケーションです。JavaScriptの非同期処理をより効率的かつ安全に管理するためのワークフローエンジンとしてFlowedを採用しています。

## Flowedフレームワークについて

### 並行プログラミングの機構

Flowedは、JavaScriptに**構造化された並行プログラミング**の機構を追加することを目的として設計されています：

#### 1. **自動並行実行**
- 依存関係のないタスクは自動的に並行実行される
- 開発者が明示的にPromise.allやasync/awaitを管理する必要がない
- CPUとI/Oリソースの効率的な活用

#### 2. **宣言的ワークフロー定義**
- JSONベースの設定でワークフローを定義
- コードの可読性と保守性の向上
- ビジネスロジックとフロー制御の分離

#### 3. **型安全性**
- TypeScriptとの完全な統合
- コンパイル時の型チェック
- 実行時エラーの削減

### 依存関係制御の利点

#### 1. **自動依存関係解決**
```javascript
// 従来のJavaScript
async function processData() {
  const dataA = await fetchDataA();
  const dataB = await fetchDataB();
  const result = await processDataAB(dataA, dataB);
  return result;
}

// Flowedを使用
const flow = {
  tasks: {
    fetchA: { provides: ['dataA'], resolver: { name: 'fetchDataA' } },
    fetchB: { provides: ['dataB'], resolver: { name: 'fetchDataB' } },
    process: { 
      requires: ['dataA', 'dataB'], 
      provides: ['result'],
      resolver: { name: 'processDataAB' }
    }
  }
};
```

#### 2. **最適化された実行順序**
- **並行実行**: `fetchA`と`fetchB`は同時実行
- **依存待機**: `process`は両方の完了を自動的に待機
- **デッドロック回避**: 循環依存の検出と回避

#### 3. **エラーハンドリングの改善**
- タスクレベルでのエラー分離
- 部分的な失敗に対する柔軟な対応
- エラー伝播の制御

#### 4. **スケーラビリティ**
- 複雑なワークフローでも宣言的に記述
- タスクの追加・削除が容易
- マイクロサービス間の協調処理に適用可能

## プロジェクト構成

```
flowed/
├── src/
│   └── index.ts          # メインアプリケーション
├── public/
│   └── index.html        # フロントエンド
├── flow-dependency-analysis.md  # フロー依存関係の分析
├── package.json
└── README.md
```

## 実装されているフロー

### 1. TODOアプリケーションフロー
4段階の処理パイプライン：
- **受付係**: 入力検証（Zodバリデーション）
- **処理係**: TODOオブジェクトの作成
- **保存係**: メモリへの保存
- **通知係**: 処理完了の通知

### 2. 並行処理デモフロー
依存関係のある複数タスクの協調実行：
- **msg1, msg2**: 並行でメッセージ生成
- **msg3**: msg1とmsg2の結果を組み合わせ
- **calc**: 独立した計算処理
- **print, printNumber**: 結果の出力

## 技術スタック

- **フレームワーク**: Flowed（ワークフロー管理）、Hono（Webサーバー）
- **言語**: TypeScript
- **バリデーション**: Zod
- **開発ツール**: tsx（ホットリロード）、Biome（フォーマット）

## セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# フォーマット
npm run format
```

## APIエンドポイント

- `POST /api/todos` - TODO作成（メインフロー）
- `POST /api/mvp` - 最小構成テスト
- `POST /api/multi-task` - 並行処理デモ
- `GET /api/basic` - 基本動作テスト

## 使用例

```bash
# TODO作成
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text": "新しいTODO"}'

# 並行処理テスト
curl -X POST http://localhost:3000/api/multi-task \
  -H "Content-Type: application/json" \
  -d '{"test": "dependency test"}'
```

## Flowedの利点まとめ

1. **開発効率の向上**: 複雑な非同期処理を宣言的に記述
2. **パフォーマンス最適化**: 自動並行実行による処理時間の短縮
3. **保守性**: ワークフローの可視化と変更の容易さ
4. **信頼性**: 型安全性とエラーハンドリングの改善
5. **スケーラビリティ**: 大規模システムでの協調処理に対応

## 参考資料

- [Flowed公式ドキュメント](https://danielduarte.github.io/flowed/)
- [フロー依存関係分析](./flow-dependency-analysis.md)
- [Flowedリポジトリ](https://github.com/danielduarte/flowed) 