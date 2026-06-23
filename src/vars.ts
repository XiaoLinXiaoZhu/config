/**
 * @xlxz/config vars — 步骤 3：$VAR 替换
 *
 * 字符串值匹配 $标识符 时，从 envPool 替换。
 * 不要求大写——$my_var 同样触发替换。
 * 在继承解析之前执行，支持 "&" = "$PRESET" 动态切换继承源。
 */

import type { ConfigError, Trace } from "./types";

const VAR_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;

function resolveVarsRecursive(
	obj: unknown,
	envPool: Readonly<Record<string, string>>,
	trace: Trace,
	prefix: string,
	errors: ConfigError[],
): unknown {
	if (typeof obj === "string") {
		const m = obj.match(VAR_RE);
		if (m) {
			const varName = m[1] ?? "";
			const resolved = envPool[varName];
			if (resolved === undefined) {
				const sourceName = trace[prefix]?.source ?? "未知";
				errors.push({
					kind: "env_var_not_found" as const,
					varName,
					sourceName,
					message: `环境变量 ${varName} 未找到（在配置源 "${sourceName}" 的 ${prefix} 中引用）`,
				});
				return obj;
			}
			// 更新 trace 的值为替换后的值
			if (trace[prefix]) {
				trace[prefix] = { value: resolved, source: trace[prefix].source };
			}
			return resolved;
		}
		return obj;
	}

	if (Array.isArray(obj)) {
		const result: unknown[] = [];
		for (let i = 0; i < obj.length; i++) {
			const r = resolveVarsRecursive(
				obj[i],
				envPool,
				trace,
				`${prefix}[${i}]`,
				errors,
			);
			result.push(r);
		}
		return result;
	}

	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			const dotPath = prefix ? `${prefix}.${k}` : k;
			result[k] = resolveVarsRecursive(v, envPool, trace, dotPath, errors);
		}
		return result;
	}

	return obj;
}

/**
 * 遍历数据，替换所有 $VAR 字符串。
 */
export function resolveVars(
	data: Record<string, unknown>,
	envPool: Readonly<Record<string, string>>,
	trace: Trace,
): { data: Record<string, unknown>; errors: ConfigError[] } {
	const errors: ConfigError[] = [];
	const resolved = resolveVarsRecursive(data, envPool, trace, "", errors);
	return {
		data: resolved as Record<string, unknown>,
		errors,
	};
}
