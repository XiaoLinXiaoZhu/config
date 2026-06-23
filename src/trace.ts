/**
 * @xlxz/config trace — 步骤 6：trace 补全
 *
 * 遍历校验后的数据，为 trace 中缺失的字段补充来源（标为 "zod default"）。
 */

import type { Trace } from "./types";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 补充 trace：zod 默认值填充的字段标记为 "zod default"。
 */
export function buildFinalTrace(
	validated: unknown,
	prefix: string,
	trace: Trace,
): void {
	if (!isObject(validated)) return;

	for (const [key, val] of Object.entries(validated)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;
		if (isObject(val)) {
			buildFinalTrace(val, dotPath, trace);
		} else if (val !== undefined && !trace[dotPath]) {
			trace[dotPath] = { value: val, source: "zod default" };
		}
	}
}
