/**
 * @xlxz/config merge — 步骤 2：多源 deep merge + trace 构建
 *
 * 后者覆盖前者。trace 记录每个字段的值和来源。
 */

import type { ParsedSource, Trace } from "./types.ts";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 构建初始 trace：递归遍历对象，为每个标量值记录来源。
 */
function buildTrace(
	obj: unknown,
	source: string,
	prefix: string,
	trace: Trace,
): void {
	if (obj === null || obj === undefined) return;
	if (typeof obj !== "object") return;
	if (Array.isArray(obj)) return; // 数组不展开为 trace
	for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;
		if (isObject(val)) {
			buildTrace(val, source, dotPath, trace);
		} else if (val !== undefined) {
			trace[dotPath] = { value: val, source };
		}
	}
}

/**
 * 递归 deep merge：overlay 覆盖 base，对象深层合并，标量直接覆盖。
 */
function deepMerge(
	base: Record<string, unknown>,
	overlay: Record<string, unknown>,
	overlaySource: string,
	trace: Trace,
	prefix: string,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key of Object.keys(base)) {
		result[key] = base[key];
	}

	for (const key of Object.keys(overlay)) {
		const overlayVal = overlay[key];
		const baseVal = base[key];
		const dotPath = prefix ? `${prefix}.${key}` : key;

		if (isObject(overlayVal) && isObject(baseVal)) {
			result[key] = deepMerge(
				baseVal,
				overlayVal,
				overlaySource,
				trace,
				dotPath,
			);
		} else {
			result[key] = overlayVal;
			if (isObject(overlayVal)) {
				buildTrace(overlayVal, overlaySource, dotPath, trace);
			} else if (overlayVal !== undefined) {
				trace[dotPath] = { value: overlayVal, source: overlaySource };
			}
		}
	}

	return result;
}

/**
 * 合并多个配置源，后者覆盖前者。同时构建 trace。
 */
export function mergeSources(parsedSources: ReadonlyArray<ParsedSource>): {
	merged: Record<string, unknown>;
	trace: Trace;
} {
	let merged: Record<string, unknown> = {};
	const trace: Trace = {};

	for (const { name, data } of parsedSources) {
		if (Object.keys(merged).length === 0) {
			merged = data;
			buildTrace(data, name, "", trace);
		} else {
			const newTrace: Trace = {};
			buildTrace(data, name, "", newTrace);
			for (const [k, v] of Object.entries(newTrace)) {
				trace[k] = v;
			}
			merged = deepMerge(merged, data, name, trace, "");
		}
	}

	return { merged, trace };
}
