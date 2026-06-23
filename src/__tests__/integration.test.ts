/**
 * 集成场景测试 — UC-9.1, UC-9.2
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";

test("全局定义 base，项目通过继承引用", () => {
	const schema = z.object({
		settings: z.object({
			strip_hint: z.boolean(),
			llm: z.object({
				provider: z.string(),
				api_key: z.string(),
				model: z.string(),
			}),
			editor: z.object({
				provider: z.string(),
				api_key: z.string(),
				model: z.string(),
			}),
		}),
		base: z.record(z.string(), z.unknown()).optional(),
	});

	const result = getConfig(
		schema,
		[
			{
				name: "默认",
				content: `
[settings]
strip_hint = true
`,
			},
			{
				name: "全局",
				content: `
[base]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"

[settings.llm]
"&" = "base"

[settings.editor]
"&" = "base"
model = "gpt-4o"
`,
			},
			{
				name: "项目",
				content: `
[settings]
strip_hint = false
`,
			},
		],
		{ ANTHROPIC_KEY: "sk-ant-xxx" },
	);

	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.data.settings.llm.provider).toBe("anthropic");
	expect(result.data.settings.llm.api_key).toBe("sk-ant-xxx");
	expect(result.data.settings.llm.model).toBe("claude-opus");
	expect(result.data.settings.editor.provider).toBe("anthropic");
	expect(result.data.settings.editor.model).toBe("gpt-4o");
	expect(result.data.settings.strip_hint).toBe(false);

	expect(result.trace["settings.strip_hint"]?.source).toBe("项目");
	expect(result.trace["settings.llm.model"]?.source).toBe("全局");
});

test("$PRESET 动态切换继承源", () => {
	const schema = z.object({
		config: z.record(z.string(), z.unknown()),
		dev: z.record(z.string(), z.unknown()).optional(),
		prod: z.record(z.string(), z.unknown()).optional(),
	});

	const result = getConfig(
		schema,
		[
			{
				name: "全局",
				content: `
[dev]
debug = true
level = "debug"

[prod]
debug = false
level = "info"

[config]
"&" = "$ENV"
`,
			},
		],
		{ ENV: "prod" },
	);

	expect(result.success).toBe(true);
	if (!result.success) return;

	const config = result.data.config as Record<string, unknown>;
	expect(config.debug).toBe(false);
	expect(config.level).toBe("info");
});
