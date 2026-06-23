/**
 * @xlxz/config inherit — 步骤 4：继承解析
 *
 * 两阶段：
 *   A. table 级继承（& / && / &&& ...）— 迭代解析，含链式、循环检测、深层合并
 *   B. 字段级 pick（&field / &&field ...）— 一次性解析，覆盖继承和自有值
 *
 * 优先级：字段 pick > 自有字段 > table 继承（&&& > && > &）
 */

import {
	collectInheritTree,
	extractInheritInfo,
	isFieldPickKey,
	isTableInheritKey,
} from "./inherit-tree.ts";
import { deepClone, getByPath } from "./path.ts";
import type { ConfigError, InheritTree, Trace } from "./types.ts";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ═══════════════════════════════════════════════════════════
// trace 工具
// ═══════════════════════════════════════════════════════════

/**
 * 从源路径复制 trace 到目标路径。
 */
function copyTraceSubtree(
	trace: Trace,
	srcPrefix: string,
	dstPrefix: string,
): void {
	for (const [path, entry] of Object.entries(trace)) {
		if (path === srcPrefix || path.startsWith(`${srcPrefix}.`)) {
			const suffix = path === srcPrefix ? "" : path.slice(srcPrefix.length);
			const dstPath = dstPrefix + suffix;
			if (!trace[dstPath]) {
				trace[dstPath] = { ...entry };
			}
		}
	}
}

/**
 * 为对象子树构建 trace（仅在缺失时补充）。
 */
function ensureTrace(
	val: unknown,
	source: string,
	prefix: string,
	trace: Trace,
): void {
	if (val === null || typeof val !== "object" || Array.isArray(val)) return;
	for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
		const dotPath = prefix ? `${prefix}.${k}` : k;
		if (isObject(v)) {
			ensureTrace(v, source, dotPath, trace);
		} else if (v !== undefined && !trace[dotPath]) {
			trace[dotPath] = { value: v, source };
		}
	}
}

// ═══════════════════════════════════════════════════════════
// deep merge（继承专用）
// ═══════════════════════════════════════════════════════════

/**
 * 递归合并：overlay 覆盖 base，对象深层合并，标量直接覆盖。
 * 返回新对象，不修改输入。
 */
function deepMergeTables(
	base: Record<string, unknown>,
	overlay: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(base)) {
		result[key] = deepClone(base[key]);
	}
	for (const key of Object.keys(overlay)) {
		const overlayVal = overlay[key];
		const baseVal = result[key];
		if (isObject(overlayVal) && isObject(baseVal)) {
			result[key] = deepMergeTables(baseVal, overlayVal);
		} else {
			result[key] = deepClone(overlayVal);
		}
	}
	return result;
}

// ═══════════════════════════════════════════════════════════
// 阶段 A：table 级继承
// ═══════════════════════════════════════════════════════════

interface PendingInherit {
	/** 含继承键的 table 对象 */
	table: Record<string, unknown>;
	/** 此 table 的 dot-path */
	path: string;
}

/**
 * 递归查找所有含继承键的 table。
 */
function findPendingInherits(
	obj: Record<string, unknown>,
	prefix: string,
): PendingInherit[] {
	const result: PendingInherit[] = [];

	const info = extractInheritInfo(obj);
	if (info.extends.length > 0) {
		result.push({ table: obj, path: prefix });
	}

	for (const [key, val] of Object.entries(obj)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;
		if (isObject(val)) {
			result.push(...findPendingInherits(val, dotPath));
		}
	}

	return result;
}

/**
 * 阶段 A：解析所有 table 级继承。
 *
 * 迭代算法：每轮找待解析节点，检查继承源是否已解析完。
 * 按优先级从低到高合并继承源，自有字段（含 pick 键）覆盖继承结果。
 * pick 键保留到阶段 B 处理。
 */
function resolveTableInherits(
	root: Record<string, unknown>,
	trace: Trace,
	errors: ConfigError[],
): void {
	const visited = new Set<string>();

	for (let iteration = 0; iteration < 200; iteration++) {
		const pending = findPendingInherits(root, "");
		if (pending.length === 0) return;

		let progress = false;

		for (const { table, path } of pending) {
			const info = extractInheritInfo(table);
			if (info.extends.length === 0) continue;

			// 检查所有继承源是否已解析完
			let allResolved = true;
			const resolvedSources: Array<{ path: string; priority: number }> = [];

			for (const src of info.extends) {
				const target = getByPath(root, src.path);
				if (target === undefined) {
					errors.push({
						kind: "extend_target_not_found",
						targetPath: src.path,
						parentPath: path,
						message: `继承目标 "${src.path}" 不存在（在 "${path}" 中引用）`,
					});
					continue;
				}
				if (!isObject(target)) {
					errors.push({
						kind: "extend_target_not_found",
						targetPath: src.path,
						parentPath: path,
						message: `继承目标 "${src.path}" 不是 object（在 "${path}" 中引用）`,
					});
					continue;
				}
				const targetInfo = extractInheritInfo(target);
				if (targetInfo.extends.length > 0) {
					allResolved = false;
					break;
				}
				resolvedSources.push(src);
			}

			if (!allResolved) continue;

			// 循环检测
			for (const src of resolvedSources) {
				const chainKey = `${path}→${src.path}`;
				if (visited.has(chainKey)) {
					errors.push({
						kind: "circular_extend",
						chain: [path, src.path],
						message: `检测到循环继承: ${path} → ${src.path}`,
					});
				}
				visited.add(chainKey);
			}

			// 按优先级从低到高合并继承源
			let merged: Record<string, unknown> = {};
			for (const src of resolvedSources) {
				const target = getByPath(root, src.path);
				if (target !== undefined && isObject(target)) {
					merged = deepMergeTables(merged, target);
					// 复制继承源 trace 到当前路径
					copyTraceSubtree(trace, src.path, path);
				}
			}

			// 自有字段覆盖（非继承键，但保留 pick 键让阶段 B 处理）
			const ownFields: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(table)) {
				if (!isTableInheritKey(k)) {
					ownFields[k] = v;
				}
			}
			merged = deepMergeTables(merged, ownFields);

			// 用合并结果替换 table 内容
			for (const key of Object.keys(table)) {
				delete table[key];
			}
			for (const [k, v] of Object.entries(merged)) {
				table[k] = v;
			}

			progress = true;
		}

		if (!progress) {
			const remaining = findPendingInherits(root, "");
			for (const { table, path } of remaining) {
				const info = extractInheritInfo(table);
				for (const src of info.extends) {
					errors.push({
						kind: "circular_extend",
						chain: [path, src.path],
						message: `无法解析继承链，可能存在循环: ${path} → ${src.path}`,
					});
				}
			}
			return;
		}
	}

	errors.push({
		kind: "circular_extend",
		chain: [],
		message: "继承解析超过最大迭代次数，可能存在复杂循环依赖",
	});
}

// ═══════════════════════════════════════════════════════════
// 阶段 B：字段级 pick
// ═══════════════════════════════════════════════════════════

interface PendingPick {
	/** pick 键所在的对象 */
	table: Record<string, unknown>;
	/** pick 键 */
	key: string;
	/** 字段名 */
	field: string;
	/** pick 来源 dot-path */
	sourcePath: string;
	/** 优先级 */
	priority: number;
	/** table 的 dot-path */
	tablePath: string;
}

/**
 * 递归查找所有字段 pick 节点。
 */
function findPendingPicks(
	obj: Record<string, unknown>,
	prefix: string,
): PendingPick[] {
	const result: PendingPick[] = [];

	for (const [key, val] of Object.entries(obj)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;

		if (isObject(val)) {
			result.push(...findPendingPicks(val, dotPath));
		}

		if (isFieldPickKey(key) && typeof val === "string") {
			const field = key.replace(/^&+/, "");
			result.push({
				table: obj,
				key,
				field,
				sourcePath: val,
				priority: key.length - field.length,
				tablePath: prefix,
			});
		}
	}

	return result;
}

/**
 * 阶段 B：解析所有字段级 pick。
 *
 * 同 table 内同字段名的 pick 只保留最高优先级。
 */
function resolveFieldPicks(
	root: Record<string, unknown>,
	trace: Trace,
	errors: ConfigError[],
): void {
	const pending = findPendingPicks(root, "");

	// 按 tablePath 分组
	const grouped = new Map<string, PendingPick[]>();
	for (const p of pending) {
		const group = grouped.get(p.tablePath) ?? [];
		group.push(p);
		grouped.set(p.tablePath, group);
	}

	for (const [, group] of grouped) {
		// 同字段名只保留最高优先级
		const fieldMap = new Map<string, PendingPick>();
		for (const p of group) {
			const existing = fieldMap.get(p.field);
			if (!existing || p.priority > existing.priority) {
				fieldMap.set(p.field, p);
			}
		}

		for (const p of fieldMap.values()) {
			const target = getByPath(root, p.sourcePath);

			if (target === undefined) {
				errors.push({
					kind: "extend_target_not_found",
					targetPath: p.sourcePath,
					parentPath: p.tablePath ? `${p.tablePath}.${p.key}` : p.key,
					message: `pick 目标 "${p.sourcePath}" 不存在（在 "${p.tablePath}" 中引用）`,
				});
				delete p.table[p.key];
				continue;
			}

			// 赋值（深拷贝）
			const cloned = deepClone(target);
			p.table[p.field] = cloned;

			// 更新 trace
			const fieldDotPath = p.tablePath ? `${p.tablePath}.${p.field}` : p.field;
			const targetTraceEntry = trace[p.sourcePath];
			if (targetTraceEntry) {
				trace[fieldDotPath] = {
					value: cloned,
					source: targetTraceEntry.source,
				};
			}
			// 如果目标是 table，递归复制子字段 trace
			if (isObject(cloned)) {
				ensureTrace(
					cloned,
					targetTraceEntry?.source ?? "unknown",
					fieldDotPath,
					trace,
				);
			}

			// 删除 pick 键
			delete p.table[p.key];
		}
	}
}

// ═══════════════════════════════════════════════════════════
// 主函数
// ═══════════════════════════════════════════════════════════

/**
 * 解析继承：table 级继承 → 字段级 pick。同时构建 InheritTree。
 */
export function resolveInherits(
	data: Record<string, unknown>,
	trace: Trace,
): {
	data: Record<string, unknown>;
	trace: Trace;
	inheritTree: InheritTree;
	errors: ConfigError[];
} {
	const errors: ConfigError[] = [];
	// 深拷贝避免修改输入
	const working = deepClone(data);

	// 先收集 InheritTree（在继承键被删除前）
	const inheritTree: InheritTree = {};
	collectInheritTree(working, "", inheritTree);

	// 阶段 A：table 级继承
	resolveTableInherits(working, trace, errors);

	// 阶段 B：字段级 pick
	resolveFieldPicks(working, trace, errors);

	return { data: working, trace, inheritTree, errors };
}
