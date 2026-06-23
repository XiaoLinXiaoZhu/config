/**
 * 基本解析测试 — UC-1.1, UC-1.2
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index";
import basicDefault from "./fixtures/basic-default.toml" with { type: "text" };
import basicSingle from "./fixtures/basic-single.toml" with { type: "text" };

const schema = z.object({
	settings: z.object({
		strip_hint: z.boolean(),
	}),
});

test("解析单个 TOML 源返回正确数据", () => {
	const result = getConfig(schema, [{ name: "默认", content: basicSingle }]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.settings.strip_hint).toBe(false);
});

test("schema 默认值填充未提供的字段", () => {
	const schemaWithDefault = z.object({
		settings: z.object({
			llm: z.object({
				provider: z.string(),
				api_key: z.string(),
				model: z.string(),
				base_url: z.string().default("https://api.deepseek.com"),
			}),
		}),
	});

	const result = getConfig(schemaWithDefault, [
		{ name: "默认", content: basicDefault },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.settings.llm.base_url).toBe("https://api.deepseek.com");
	expect(result.trace["settings.llm.base_url"]?.source).toBe("zod default");
});
