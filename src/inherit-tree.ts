/**
 * @xlxz/config inherit-tree — 继承结构元数据构建
 *
 * 在继承解析完成后，构建 InheritTree，记录每个 table 的继承源、自有字段、pick 列表。
 */

import type { FieldPick, InheritSource, InheritTree } from "./types.ts";

/**
 * 判断 key 是否为 table 级继承（key 全部由 & 组成）。
 */
export function isTableInheritKey(key: string): boolean {
	return key.length > 0 && [...key].every((c) => c === "&");
}

/**
 * 判断 key 是否为字段级 pick（& 开头但后面有非 & 字符）。
 */
export function isFieldPickKey(key: string): boolean {
	return key.startsWith("&") && !isTableInheritKey(key);
}

/**
 * 从 & 前缀 key 中提取优先级（& 的数量）。
 */
export function getPriority(key: string): number {
	const match = key.match(/^(&+)/);
	return match ? (match[1] ?? "").length : 0;
}

/**
 * 从字段 pick key 中提取字段名（去掉 & 前缀）。
 */
export function getFieldFromPickKey(key: string): string {
	return key.replace(/^&+/, "");
}

/**
 * 收集对象中所有 table 继承节点和字段 pick 节点，构建 InheritTree。
 */
export function buildInheritTree(
	obj: unknown,
	prefix: string,
	tree: InheritTree,
): void {
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;

	for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;

		// 递归处理子对象
		if (val !== null && typeof val === "object" && !Array.isArray(val)) {
			buildInheritTree(val, dotPath, tree);
		}
	}

	// 当前对象的继承信息在继承解析前就已收集
	// 此函数在继承解析前调用，收集原始结构
}

/**
 * 从一个 table 对象中提取继承信息（继承源、自有字段、pick）。
 * 在继承解析之前调用，此时 & 键还存在。
 */
export function extractInheritInfo(table: Record<string, unknown>): {
	extends: InheritSource[];
	ownFields: string[];
	picks: FieldPick[];
} {
	const extendsList: InheritSource[] = [];
	const picks: FieldPick[] = [];
	const ownFields: string[] = [];

	for (const [key, val] of Object.entries(table)) {
		if (isTableInheritKey(key)) {
			if (typeof val === "string") {
				extendsList.push({ path: val, priority: getPriority(key) });
			}
		} else if (isFieldPickKey(key)) {
			if (typeof val === "string") {
				picks.push({
					field: getFieldFromPickKey(key),
					path: val,
					priority: getPriority(key),
				});
			}
		} else {
			ownFields.push(key);
		}
	}

	// 按优先级排序（低优先级在前）
	extendsList.sort((a, b) => a.priority - b.priority);
	picks.sort((a, b) => a.priority - b.priority);

	return { extends: extendsList, ownFields, picks };
}

/**
 * 递归遍历整个树，为每个含继承信息的 table 构建 InheritTree 条目。
 */
export function collectInheritTree(
	obj: unknown,
	prefix: string,
	tree: InheritTree,
): void {
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;

	const table = obj as Record<string, unknown>;
	const info = extractInheritInfo(table);

	// 只记录有继承信息的 table
	if (info.extends.length > 0 || info.picks.length > 0) {
		tree[prefix] = info;
	}

	for (const [key, val] of Object.entries(table)) {
		const dotPath = prefix ? `${prefix}.${key}` : key;
		if (val !== null && typeof val === "object" && !Array.isArray(val)) {
			collectInheritTree(val, dotPath, tree);
		}
	}
}
