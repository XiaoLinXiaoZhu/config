/**
 * $VAR 替换测试 — UC-3.1 ~ UC-3.5
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import varBasic from "./fixtures/var-basic.toml" with { type: "text" };
import varLowercase from "./fixtures/var-lowercase.toml" with { type: "text" };
import varNoTrigger from "./fixtures/var-no-trigger.toml" with { type: "text" };
import varPreset from "./fixtures/var-preset.toml" with { type: "text" };

const schema = z.object({
	settings: z.object({
		llm: z.object({
			provider: z.string(),
			api_key: z.string(),
			model: z.string(),
		}),
	}),
});

test("$VAR 从 envPool 解析", () => {
	const result = getConfig(schema, [{ name: "默认", content: varBasic }], {
		ANTHROPIC_KEY: "sk-from-env",
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.settings.llm.api_key).toBe("sk-from-env");
});

test("$VAR 未找到时返回错误", () => {
	const result = getConfig(schema, [{ name: "默认", content: varBasic }], {});
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("env_var_not_found");
});

test("小写 $VAR 也触发替换", () => {
	const result = getConfig(schema, [{ name: "默认", content: varLowercase }], {
		my_api_key: "sk-lowercase",
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.settings.llm.api_key).toBe("sk-lowercase");
});

test("$ 后非字母/下划线开头不触发解析", () => {
	const result = getConfig(
		schema,
		[{ name: "默认", content: varNoTrigger }],
		{},
	);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.settings.llm.api_key).toBe("$123not_a_var");
});

test("$PRESET 动态切换继承源", () => {
	const presetSchema = z.object({
		config: z.record(z.string(), z.unknown()),
		base: z.record(z.string(), z.unknown()).optional(),
		alt: z.record(z.string(), z.unknown()).optional(),
	});
	const result = getConfig(
		presetSchema,
		[{ name: "默认", content: varPreset }],
		{ PRESET: "alt" },
	);
	expect(result.success).toBe(true);
	if (!result.success) return;
	const config = result.data.config as Record<string, unknown>;
	expect(config.a).toBe(2);
});
