/**
 * InheritTree 元数据测试 — UC-7.1 ~ UC-7.2
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import treeInherit from "./fixtures/tree-inherit.toml" with { type: "text" };
import treePick from "./fixtures/tree-pick.toml" with { type: "text" };

const schema = z.object({
	config: z.record(z.string(), z.unknown()),
	base: z.record(z.string(), z.unknown()).optional(),
	alt: z.record(z.string(), z.unknown()).optional(),
	sample: z.record(z.string(), z.unknown()).optional(),
});

test("inheritTree 记录 table 继承结构", () => {
	const result = getConfig(schema, [{ name: "test", content: treeInherit }]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	const entry = result.inheritTree.config;
	expect(entry).toBeDefined();
	if (!entry) return;
	expect(entry.extends).toContainEqual({ path: "base", priority: 1 });
	expect(entry.extends).toContainEqual({ path: "alt", priority: 2 });
	expect(entry.ownFields).toContain("b");
	expect(entry.picks).toEqual([]);
});

test("inheritTree 记录字段 pick 结构", () => {
	const result = getConfig(schema, [{ name: "test", content: treePick }]);
	expect(result.success).toBe(true);
	if (!result.success) return;

	const entry = result.inheritTree.config;
	expect(entry).toBeDefined();
	if (!entry) return;
	expect(entry.picks).toContainEqual({
		field: "bool",
		path: "sample.bool",
		priority: 1,
	});
	expect(entry.picks).toContainEqual({
		field: "num",
		path: "sample.num",
		priority: 2,
	});
	expect(entry.extends).toEqual([]);
});
