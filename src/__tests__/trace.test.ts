/**
 * trace 溯源测试 — UC-6.1 ~ UC-6.4
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import basicDefault from "./fixtures/basic-default.toml" with { type: "text" };
import inheritBasic from "./fixtures/inherit-basic.toml" with { type: "text" };
import mergeDefault from "./fixtures/merge-default.toml" with { type: "text" };
import mergeGlobal from "./fixtures/merge-global.toml" with { type: "text" };
import mergeProject from "./fixtures/merge-project.toml" with { type: "text" };
import pickRename from "./fixtures/pick-rename.toml" with { type: "text" };

test("trace 记录多源合并来源", () => {
	const schema = z.object({
		settings: z.object({
			strip_hint: z.boolean(),
			llm: z.object({
				provider: z.string(),
				api_key: z.string(),
				model: z.string(),
			}),
		}),
	});

	const result = getConfig(schema, [
		{ name: "默认", content: mergeDefault },
		{ name: "全局", content: mergeGlobal },
		{ name: "项目", content: mergeProject },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.trace["settings.strip_hint"]?.source).toBe("默认");
	expect(result.trace["settings.llm.provider"]?.source).toBe("全局");
	expect(result.trace["settings.llm.api_key"]?.source).toBe("项目");
});

test("trace 记录 zod 默认值", () => {
	const schema = z.object({
		settings: z.object({
			llm: z.object({
				provider: z.string(),
				api_key: z.string(),
				model: z.string(),
				base_url: z.string().default("https://api.deepseek.com"),
			}),
		}),
	});

	const result = getConfig(schema, [{ name: "默认", content: basicDefault }]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.trace["settings.llm.base_url"]?.value).toBe(
		"https://api.deepseek.com",
	);
	expect(result.trace["settings.llm.base_url"]?.source).toBe("zod default");
});

test("trace 记录继承来源", () => {
	const schema = z.object({
		config: z.record(z.string(), z.unknown()),
		base: z.record(z.string(), z.unknown()).optional(),
	});

	const result = getConfig(schema, [{ name: "test", content: inheritBasic }]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.trace["config.a"]?.value).toBe(1);
	expect(result.trace["config.a"]?.source).toBe("test");
	expect(result.trace["config.b"]?.value).toBe(2);
	expect(result.trace["config.b"]?.source).toBe("test");
});

test("trace 记录字段 pick 来源", () => {
	const schema = z.object({
		config: z.record(z.string(), z.unknown()),
		sample: z.record(z.string(), z.unknown()).optional(),
	});

	const result = getConfig(schema, [{ name: "test", content: pickRename }]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.trace["config.foo.is_on"]?.value).toBe(true);
	expect(result.trace["config.foo.is_on"]?.source).toBe("test");
});
