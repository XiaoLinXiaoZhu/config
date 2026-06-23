/**
 * 多源合并测试 — UC-2.1
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index";
import mergeDefault from "./fixtures/merge-default.toml" with { type: "text" };
import mergeGlobal from "./fixtures/merge-global.toml" with { type: "text" };
import mergeProject from "./fixtures/merge-project.toml" with { type: "text" };

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

test("后者覆盖前者，trace 记录各自来源", () => {
	const result = getConfig(schema, [
		{ name: "默认", content: mergeDefault },
		{ name: "全局", content: mergeGlobal },
		{ name: "项目", content: mergeProject },
	]);

	expect(result.success).toBe(true);
	if (!result.success) return;

	expect(result.data.settings.strip_hint).toBe(true);
	expect(result.data.settings.llm.provider).toBe("anthropic");
	expect(result.data.settings.llm.api_key).toBe("sk-project");
	expect(result.data.settings.llm.model).toBe("claude-sonnet");

	expect(result.trace["settings.strip_hint"]?.source).toBe("默认");
	expect(result.trace["settings.llm.provider"]?.source).toBe("全局");
	expect(result.trace["settings.llm.api_key"]?.source).toBe("项目");
});
