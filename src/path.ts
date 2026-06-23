/**
 * @xlxz/config path — dot-path 工具
 *
 * 支持数组索引：纯数字段视为数组索引。
 */

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 按 dot-path 读取值。纯数字段视为数组索引。
 *
 * @example getByPath({ a: { b: [1, 2] } }, "a.b.0") → 1
 */
export function getByPath(
	obj: Record<string, unknown>,
	path: string,
): unknown | undefined {
	if (path === "") return obj;
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (Array.isArray(current)) {
			const idx = Number.parseInt(part, 10);
			if (Number.isNaN(idx) || idx < 0 || idx >= current.length) {
				return undefined;
			}
			current = current[idx];
		} else if (isObject(current)) {
			current = current[part];
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * 深拷贝值。对象/数组递归拷贝，标量原样返回。
 */
export function deepClone<T>(value: T): T {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(deepClone) as unknown as T;
	}
	const result: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		result[k] = deepClone(v);
	}
	return result as unknown as T;
}
