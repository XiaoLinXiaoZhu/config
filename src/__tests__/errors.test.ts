/**
 * 错误处理测试 — UC-8.1 ~ UC-8.3
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index";
import errorMulti from "./fixtures/error-multi.toml" with { type: "text" };
import errorSchema from "./fixtures/error-schema.toml" with { type: "text" };

const schema = z.object({
	settings: z.object({
		llm: z.object({
			provider: z.string(),
			api_key: z.string(),
			model: z.string(),
		}),
	}),
});

test("无效 TOML 语法返回 toml_parse_error", () => {
	const result = getConfig(schema, [
		{ name: "默认", content: "not valid toml {{{" },
	]);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("toml_parse_error");
});

test("schema 验证失败返回 schema_validation_error", () => {
	const result = getConfig(schema, [{ name: "全局", content: errorSchema }]);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("schema_validation_error");
});

test("多个错误同时返回", () => {
	const recordSchema = z.object({ config: z.record(z.string(), z.unknown()) });
	const result = getConfig(recordSchema, [
		{ name: "test", content: errorMulti },
	]);
	expect(result.success).toBe(false);
	if (result.success) return;
	const notFoundErrors = result.errors.filter(
		(e) => e.kind === "extend_target_not_found",
	);
	expect(notFoundErrors.length).toBeGreaterThanOrEqual(2);
});
