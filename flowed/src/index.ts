import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "hono/serve-static";
import { FlowManager, ValueMap } from "flowed";
import { z } from "zod";

// Zodスキーマの定義
const TodoInputSchema = z.object({
	text: z
		.string()
		.min(1, "テキストは必須です")
		.max(100, "テキストは100文字以内にしてください"),
});

const app = new Hono();
const port = 3000;

const MVP_NAMES = {
	step1: "step1",
	step2: "step2",
};
// 最小構成のリゾルバー
const mvpResolvers = {
	[MVP_NAMES.step1]: async (params: ValueMap) => {
		console.log("Step1: 受信したparams:", JSON.stringify(params, null, 2));
		const input = params.input;

		if (!input) {
			console.log("Step1: inputが見つかりません、デフォルト値を使用");
			return { step1Result: "Step1処理完了: デフォルト値" };
		}

		const result = { step1Result: `Step1処理完了: ${input}` };
		console.log("Step1: 結果:", result);
		return result;
	},
	[MVP_NAMES.step2]: async (params: ValueMap) => {
		console.log("Step2: 受信したparams:", JSON.stringify(params, null, 2));
		const step1Result = params.step1Result;

		if (!step1Result) {
			console.log("Step2: step1Resultが見つかりません");
			return { step2Result: "Step2処理完了: step1Resultなし -> 変換済み" };
		}

		const result = { step2Result: `Step2処理完了: ${step1Result} -> 変換済み` };
		console.log("Step2: 結果:", result);
		return result;
	},
};

// 最小構成のフロー
const mvpFlow = {
	tasks: {
		firstTask: {
			requires: ["input"],
			provides: ["step1Result"],
			resolver: {
				name: MVP_NAMES.step1,
				params: {
					input: "input",
				},
				results: {
					step1Result: "step1Result",
				},
			},
		},
		secondTask: {
			requires: ["step1Result"],
			provides: ["step2Result"],
			resolver: {
				name: MVP_NAMES.step2,
				params: {
					step1Result: "step1Result",
				},
				results: {
					step2Result: "step2Result",
				},
			},
		},
	},
};

// MVPエンドポイント
app.post("/api/mvp", async (c) => {
	const body = await c.req.json();
	console.log("リクエスト受信:", body);

	const initialParams = {
		input: body.message || body.text || "デフォルトメッセージ",
	};
	console.log("初期パラメータ:", initialParams);

	try {
		console.log("ENDPOINT: MVP フロー実行開始");
		const result = await FlowManager.run(
			mvpFlow,
			initialParams,
			["step2Result"], //expectedResults は最終的に取得したい結果を書く。フローの最後で返しているオブジェクトになる
			mvpResolvers,
		);

		console.log("ENDPOINT: MVP フロー完了:", JSON.stringify(result, null, 2));

		return c.json({
			success: true,
			result: result.step2Result,
			fullResult: result,
		});
	} catch (error) {
		console.error("ENDPOINT: MVP エラー:", error);
		return c.json({ success: false, error: (error as Error).message }, 500);
	}
});

// https://github.com/danielduarte/flowed/blob/main/test/multi-process-flow.ts
app.post("/api/multi-task", async (c) => {
	let msgCount = 1;
	let msgCount2 = 1;
	let msgCount3 = 1;
	const output: string[] = [];

	class ProvideMessage1 {
		public async exec(params?: ValueMap): Promise<ValueMap> {
			console.log("ProvideMessage1: メッセージを提供中", params);

			return {
				message1: `Message1 number ${msgCount++}`,
			};
		}
	}

	class ProvideMessage2 {
		public async exec(params?: ValueMap): Promise<ValueMap> {
			console.log("ProvideMessage2: メッセージを提供中", params);
			return {
				message2: `Message2 number ${msgCount2++}`,
			};
		}
	}

	class ProvideMessage3 {
		public async exec(params?: ValueMap): Promise<ValueMap> {
			console.log("ProvideMessage3: メッセージを提供中", params);
			console.log("ProvideMessage3: 受信したmessage1:", params?.message1);
			console.log("ProvideMessage3: 受信したmessage2:", params?.message2);

			return {
				message3: `Combined: ${params?.message1} + ${params?.message2} = Message3 number ${msgCount3++}`,
			};
		}
	}

	class ProvideNumber1 {
		public async exec(params?: ValueMap): Promise<ValueMap> {
			console.log("ProvideNumber1: params", params);
			const number1 = 1;
			console.log("ProvideNumber1: 数値を提供中", number1);
			return {
				number1,
			};
		}
	}

	class ConsoleLog {
		public async exec(params: ValueMap): Promise<ValueMap> {
			output.push("Incoming message: " + params.text);
			console.log("ConsoleLog: メッセージを出力中", params.text);
			return { result: params.text };
		}
	}

	class ConsoleNumber {
		public async exec(params: ValueMap): Promise<ValueMap> {
			console.log("ConsoleNumber: 数値を出力中", params);
			return {
				result: params.number,
			};
		}
	}

	class Calculate {
		public async exec(params: ValueMap): Promise<ValueMap> {
			console.log("Calculate: 計算中", params);
			const result = params.number1 + 2 * 12;
			console.log("Calculate: 計算結果", result);
			return {
				calcResult: result,
			};
		}
	}

	const result = await FlowManager.run(
		{
			tasks: {
				msg1: {
					provides: ["message1"],
					resolver: {
						name: "provideMsg1",
						results: {
							message1: "message1",
						},
					},
				},
				msg2: {
					provides: ["message2"],
					resolver: {
						name: "provideMsg2",
						results: {
							message2: "message2",
						},
					},
				},
				// msg1とmsg2の並行処理
				msg3: {
					// requiresにはobject名を書く。msg1ではなく、msg1がprovideしているmessage1を書く。
					requires: ["message1", "message2"],
					// providesには次の並行処理に渡したいobj名を書く
					provides: ["message3"],
					// resolverにはヘルパー処理を書く
					resolver: {
						// 利用するヘルパー関数名
						name: "provideMsg3",
						params: {
							message1: "message1",
							message2: "message2",
						},
						results: {
							message3: "message3",
						},
					},
				},
				num1: {
					provides: ["number1"],
					resolver: {
						name: "provideNumber1",
						results: {
							number1: "number1",
						},
					},
				},
				calc: {
					requires: ["number1"],
					provides: ["calcResult"],
					resolver: {
						name: "calculate",
						params: { number1: "number1" },
						results: {
							calcResult: "calcResult",
						},
					},
				},
				printMessage: {
					requires: ["message3"],
					resolver: { name: "consoleLog", params: { text: "message3" } },
				},
				printNumber: {
					requires: ["calcResult"],
					resolver: { name: "consoleNumber", params: { number: "calcResult" } },
				},
			},
			// options: {
			// 	resolverAutomapResults: false,
			// },
		},
		{},
		["calcResult", "message3"], // 途中結果を受け取ることもできる
		{
			provideMsg1: ProvideMessage1,
			provideMsg2: ProvideMessage2,
			provideMsg3: ProvideMessage3,
			provideNumber1: ProvideNumber1,
			consoleLog: ConsoleLog,
			calculate: Calculate,
			consoleNumber: ConsoleNumber,
		},
	);

	console.log("ENDPOINT: 並行処理フロー完了:", JSON.stringify(result, null, 2));

	return c.json(result);
});

// 最も基本的なFlowedテスト
app.get("/api/basic", async (c) => {
	console.log("BASIC: 基本テスト開始");

	const basicFlow = {
		tasks: {
			task1: {
				provides: ["myResult"],
				resolver: {
					name: "flowed::Noop",
				},
			},
		},
	};

	try {
		console.log("BASIC: フロー実行開始");
		const result = await FlowManager.run(basicFlow, {}, ["myResult"]);
		console.log("BASIC: フロー完了:", JSON.stringify(result, null, 2));

		return c.json({
			success: true,
			result: result,
		});
	} catch (error) {
		console.error("BASIC: エラー:", error);
		return c.json({ success: false, error: (error as Error).message }, 500);
	}
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
