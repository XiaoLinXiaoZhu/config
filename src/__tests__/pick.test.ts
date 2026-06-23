/**
 * 字段级 pick 测试 — UC-5.1 ~ UC-5.8
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import pickArrayIndex from "./fixtures/pick-array-index.toml" with {
	type: "text",
};
import pickBasic from "./fixtures/pick-basic.toml" with { type: "text" };
import pickMultiPriority from "./fixtures/pick-multi-priority.toml" with {
	type: "text",
};
import pickNotFound from "./fixtures/pick-not-found.toml" with { type: "text" };
import pickOverrideInherit from "./fixtures/pick-override-inherit.toml" with {
	type: "text",
};
import pickRename from "./fixtures/pick-rename.toml" with { type: "text" };
import pickTable from "./fixtures/pick-table.toml" with { type: "text" };
import pickWithInherit from "./fixtures/pick-with-inherit.toml" with {
	type: "text",
};

const schema = z.object({
	config: z.record(z.string(), z.unknown()),
	sample: z.record(z.string(), z.unknown()).optional(),
	base: z.record(z.string(), z.unknown()).optional(),
	override: z.record(z.string(), z.unknown()).optional(),
	source1: z.record(z.string(), z.unknown()).optional(),
	source2: z.record(z.string(), z.unknown()).optional(),
	items: z.record(z.string(), z.unknown()).optional(),
});

test("基本字段 pick", () => {
	const result = getConfig(schema, [{ name: "test", content: pickBasic }]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.foo).toEqual({ bool: false, num: 42 });
});

test("字段 pick 重命名", () => {
	const result = getConfig(schema, [{ name: "test", content: pickRename }]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.foo).toEqual({ is_on: true });
});

test("字段 pick 目标是 table → 取整个 table", () => {
	const result = getConfig(schema, [{ name: "test", content: pickTable }]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.foo).toEqual({ data: { x: 1, y: 2 } });
});

test("字段 pick 目标不存在返回错误", () => {
	const result = getConfig(schema, [{ name: "test", content: pickNotFound }]);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("extend_target_not_found");
});

test("字段 pick 与 table 继承共存", () => {
	const result = getConfig(schema, [
		{ name: "test", content: pickWithInherit },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.foo).toEqual({ id: "foo", bool: false });
});

test("字段 pick 支持数组索引", () => {
	const result = getConfig(schema, [{ name: "test", content: pickArrayIndex }]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.first).toBe("a");
	expect(result.data.config.third).toBe("c");
});

test("字段 pick 多前缀优先级：&&a 覆盖 &a", () => {
	const result = getConfig(schema, [
		{ name: "test", content: pickMultiPriority },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.a).toBe("s2");
});

test("字段 pick 覆盖继承值", () => {
	const result = getConfig(schema, [
		{ name: "test", content: pickOverrideInherit },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config.value).toBe("picked");
});
