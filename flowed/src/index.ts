import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "hono/serve-static";
import { FlowManager } from "flowed";
import type { Context, Env } from "hono";
import { z } from "zod";

// Zodスキーマの定義
const TodoInputSchema = z.object({
	args: z.object({
		text: z
			.string()
			.min(1, "テキストは必須です")
			.max(100, "テキストは100文字以内にしてください"),
	}),
});

// 型定義
interface Todo {
	id: number;
	text: string;
	createdAt: string;
}

interface Logger {
	debug: (...args: any[]) => void;
	info: (...args: any[]) => void;
	error: (...args: any[]) => void;
}

// Zodから型を生成
type TodoInput = z.infer<typeof TodoInputSchema>;

const app = new Hono();
const port = 3000;

// デバッグ用のロガー
const logger: Logger = {
	debug: (...args: any[]) => console.log("DEBUG:", ...args),
	info: (...args: any[]) => console.log("INFO:", ...args),
	error: (...args: any[]) => console.error("ERROR:", ...args),
};

// メモリ内のTODOリスト
let todos: Todo[] = [];

// カスタムリゾルバーの作成
const customResolvers = {
	"app::validateInput": async (params: { args: TodoInput["args"] }) => {
		logger.debug("受付係: 入力を検証中", params);

		// 入力がない場合はエラー
		if (!params.args) {
			logger.debug("受付係: 入力がありません");
			return { validatedInput: null, error: "入力データがありません" };
		}

		// Zodを使ってバリデーション
		try {
			const validatedInput = TodoInputSchema.parse(params.args);
			logger.debug("受付係: 検証完了", validatedInput);
			return { validatedInput, error: null };
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errorMessage = error.errors.map((e) => e.message).join(", ");
				logger.debug("受付係: 検証エラー", errorMessage);
				return { validatedInput: null, error: errorMessage };
			}
			throw error;
		}
	},
	"app::processTodo": async (params) => {
		logger.debug("処理係: TODOを処理中", params);

		// エラーがある場合は処理を中断
		if (params.error || !params.validatedInput) {
			return { todo: null, error: params.error || "入力データがありません" };
		}

		// TODOにIDや日時などを追加
		const todo = {
			id: Date.now(),
			text: params.validatedInput.text, // textを明示的に設定
			createdAt: new Date().toISOString(),
		};
		logger.debug("処理係: 処理完了", todo);
		return { todo, error: null };
	},
	"app::storeTodo": async (params) => {
		logger.debug("保存係: TODOを保存中", params);

		// エラーがある場合は処理を中断
		if (params.error || !params.todo) {
			return { savedTodo: null, error: params.error };
		}

		// 実際の保存ロジック（今回はメモリに保存）
		todos.push(params.todo);
		logger.debug("保存係: 保存完了", todos.length);
		return { savedTodo: params.todo, error: null };
	},
	"app::notifyCompletion": async (params) => {
		logger.debug("通知係: 処理完了を通知", params);

		// エラーがある場合は処理結果にエラーを含める
		if (params.error) {
			return { result: { success: false, error: params.error, todo: null } };
		}

		// 実際の通知ロジック
		return { result: { success: true, error: null, todo: params.savedTodo } };
	},
};

// TODOタスクの処理フロー
const todoProcessingFlow = {
	tasks: {
		// 受付係：リクエストの検証
		receptionist: {
			requires: ["args"],
			provides: ["validatedInput", "error"],
			resolver: {
				name: "app::validateInput",
				params: {
					args: "${args}",
				},
			},
		},
		// 処理係：TODOの作成
		processor: {
			requires: ["validatedInput", "error"],
			provides: ["todo", "error"],
			resolver: {
				name: "app::processTodo",
				params: {
					validatedInput: "${validatedInput}",
					error: "${error}",
				},
			},
		},
		// 保存係：TODOの保存
		storage: {
			requires: ["todo", "error"],
			provides: ["savedTodo", "error"],
			resolver: {
				name: "app::storeTodo",
				params: {
					todo: "${todo}",
					error: "${error}",
				},
			},
		},
		// 通知係：処理完了の通知
		notifier: {
			requires: ["savedTodo", "error"],
			provides: ["result"],
			resolver: {
				name: "app::notifyCompletion",
				params: {
					savedTodo: "${savedTodo}",
					error: "${error}",
				},
			},
		},
	},
	// フローの結果として返す値を指定
	results: {
		processingResult: "result",
	},
};

// 並行処理のデモ用フロー
const parallelProcessingFlow = {
	tasks: {
		// 並行して実行されるタスク
		taskA: {
			provides: ["resultA"],
			resolver: {
				name: "flowed::Noop",
				params: {
					value: "TaskA completed",
				},
			},
		},
		taskB: {
			provides: ["resultB"],
			resolver: {
				name: "flowed::Noop",
				params: {
					value: "TaskB completed",
				},
			},
		},
		// 上記のタスクの結果を待って実行されるタスク
		taskC: {
			requires: ["resultA", "resultB"],
			provides: ["finalResult"],
			resolver: {
				name: "flowed::Noop",
				params: {
					value: "All tasks completed",
				},
			},
		},
	},
	// フローの結果として返す値を指定
	results: {
		parallelResult: "finalResult",
	},
};

// APIエンドポイント
app.post("/api/todos", async (c) => {
	let todoInput = await c.req.json();
	console.log("リクエスト受信:", todoInput);
	logger.info("新しいTODOリクエスト受信:", todoInput);

	try {
		const flowResult = await FlowManager.run(
			todoProcessingFlow,
			{
				input: todoInput,
			},
			[],
			customResolvers,
		);
		logger.info("TODOフロー完了:", flowResult);

		// 処理結果がない場合
		if (!flowResult || !flowResult.processingResult) {
			return c.json(
				{
					success: false,
					error: "処理結果が取得できませんでした",
				},
				500,
			);
		}

		// 処理結果にエラーがある場合は400エラーを返す
		if (
			typeof flowResult.processingResult === "object" &&
			"success" in flowResult.processingResult &&
			!flowResult.processingResult.success
		) {
			return c.json(
				{
					success: false,
					error:
						flowResult.processingResult.error || "不明なエラーが発生しました",
				},
				400,
			);
		}

		const parallelResult = await FlowManager.run(
			parallelProcessingFlow,
			{},
			[],
			customResolvers,
		);
		logger.info("並行処理フロー完了:", parallelResult);

		// TODOが正常に作成された場合の応答
		const todo = flowResult.processingResult.todo;

		return c.json({
			success: true,
			todo: todo,
			todos,
			parallelResult: parallelResult.parallelResult,
		});
	} catch (error) {
		logger.error("フロー実行エラー:", error);
		return c.json({ success: false, error: (error as Error).message }, 500);
	}
});

app.get("/api/todos", async (c) => {
	logger.info("TODOリスト取得リクエスト");
	return c.json(todos);
});

// 静的ファイルの提供
app.get("/", (c) => c.redirect("/index.html"));

// 静的ファイルの提供方法をHono v4対応に修正
app.use(
	"/*",
	serveStatic({
		root: "./public",
		getContent: async () => null, // Use default behavior
	}),
);

// サーバーの起動
const server = serve({
	fetch: app.fetch,
	port,
});

console.log(`TODOアプリケーションが http://localhost:${port} で起動しました`);
