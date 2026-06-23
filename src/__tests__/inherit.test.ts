/**
 * table 级继承测试 — UC-4.1 ~ UC-4.11
 */

import { expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import inheritBasic from "./fixtures/inherit-basic.toml" with { type: "text" };
import inheritChain from "./fixtures/inherit-chain.toml" with { type: "text" };
import inheritCircular from "./fixtures/inherit-circular.toml" with {
	type: "text",
};
import inheritMulti from "./fixtures/inherit-multi.toml" with { type: "text" };
import inheritMultiOwn from "./fixtures/inherit-multi-own.toml" with {
	type: "text",
};
import inheritNested from "./fixtures/inherit-nested.toml" with {
	type: "text",
};
import inheritNestedOverride from "./fixtures/inherit-nested-override.toml" with {
	type: "text",
};
import inheritNotFound from "./fixtures/inherit-not-found.toml" with {
	type: "text",
};
import inheritNotObject from "./fixtures/inherit-not-object.toml" with {
	type: "text",
};
import inheritOverride from "./fixtures/inherit-override.toml" with {
	type: "text",
};

const recordSchema = z.object({
	config: z.record(z.string(), z.unknown()),
});

// 链式继承 fixture 含 a/b/c，不含 config
const chainSchema = z.object({
	a: z.record(z.string(), z.unknown()).optional(),
	b: z.record(z.string(), z.unknown()).optional(),
	c: z.record(z.string(), z.unknown()).optional(),
});

const optionalSchema = z.object({
	config: z.record(z.string(), z.unknown()),
	base: z.record(z.string(), z.unknown()).optional(),
	base1: z.record(z.string(), z.unknown()).optional(),
	base2: z.record(z.string(), z.unknown()).optional(),
	scalar: z.record(z.string(), z.unknown()).optional(),
});

const circularSchema = z.object({
	a: z.record(z.string(), z.unknown()).optional(),
	b: z.record(z.string(), z.unknown()).optional(),
});

test("基本继承：config 继承 base 全部字段", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritBasic },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({ a: 1, b: 2 });
});

test("继承后自有字段覆盖继承值", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritOverride },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({ a: 1, b: 3 });
});

test("多继承源优先级：&& 覆盖 &", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritMulti },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({ a: 2, b: 2 });
});

test("多继承源 + 自有字段：自有 > && > &", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritMultiOwn },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({ a: 3, b: 2, c: 2 });
});

test("链式继承：c → b → a 逐层合并", () => {
	const result = getConfig(chainSchema, [
		{ name: "test", content: inheritChain },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.c).toEqual({ x: 1, y: 2, z: 3 });
});

test("嵌套 table 继承：深层合并", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritNested },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({
		id: "config",
		bool: true,
		thinking: { type: "enabled", budget_tokens: 10000 },
	});
});

test("嵌套 table 继承后覆盖子字段", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritNestedOverride },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config).toEqual({
		thinking: { type: "enabled", budget_tokens: 5000 },
	});
});

test("继承目标不存在返回错误", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritNotFound },
	]);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("extend_target_not_found");
});

test("继承目标不是 object 返回错误", () => {
	const result = getConfig(optionalSchema, [
		{ name: "test", content: inheritNotObject },
	]);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.errors[0]?.kind).toBe("extend_target_not_found");
});

test("循环继承检测", () => {
	const result = getConfig(circularSchema, [
		{ name: "test", content: inheritCircular },
	]);
	expect(result.success).toBe(false);
	if (result.success) return;
	const kinds = result.errors.map((e) => e.kind);
	expect(kinds).toContain("circular_extend");
});

test("& 键不出现在最终结果中", () => {
	const result = getConfig(recordSchema, [
		{ name: "test", content: inheritBasic },
	]);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.config["&"]).toBeUndefined();
});
