/**
 * @xlxz/config config — getConfig easy api
 *
 * 组合 6 个纯函数：parseTOML → mergeSources → resolveVars → resolveInherits → validateSchema → buildFinalTrace
 */

import type { z } from "zod";
import { resolveInherits } from "./inherit.ts";
import { mergeSources } from "./merge.ts";
import { parseTOMLSources } from "./parse.ts";
import { buildFinalTrace } from "./trace.ts";
import type { ConfigResult, ConfigSource } from "./types.ts";
import { validateSchema } from "./validate.ts";
import { resolveVars } from "./vars.ts";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 加载并解析 TOML 配置。
 *
 * @param schema zod schema，描述期望的配置形状
 * @param sources TOML 配置源数组（按顺序，后者覆盖前者）
 * @param envPool 环境变量池，用于 $VAR 替换（默认空对象）
 * @returns ConfigResult — 成功含 data + trace + inheritTree，失败含 errors
 */
export function getConfig<T>(
	schema: z.ZodType<T>,
	sources: ConfigSource[],
	envPool: Record<string, string> = {},
): ConfigResult<T> {
	// ── 1. TOML 解析 ──
	const { sources: parsed, errors: parseErrors } = parseTOMLSources(sources);
	if (parseErrors.length > 0) {
		return { success: false, errors: parseErrors };
	}

	// ── 2. 多源合并 ──
	const { merged, trace } = mergeSources(parsed);

	// ── 3. $VAR 替换 ──
	const { data: varResolved, errors: varErrors } = resolveVars(
		merged,
		envPool,
		trace,
	);
	if (varErrors.length > 0) {
		return { success: false, errors: varErrors };
	}

	// ── 4. 继承解析 ──
	const {
		data: inherited,
		trace: inheritTrace,
		inheritTree,
		errors: inheritErrors,
	} = resolveInherits(varResolved, trace);
	if (inheritErrors.length > 0) {
		return { success: false, errors: inheritErrors };
	}

	// ── 5. zod 校验 ──
	const { data: validated, errors: validateErrors } = validateSchema(
		inherited,
		schema,
	);
	if (validateErrors.length > 0) {
		return { success: false, errors: validateErrors };
	}

	// ── 6. trace 补全 ──
	if (isObject(validated)) {
		buildFinalTrace(validated, "", inheritTrace);
	}

	return {
		success: true,
		data: validated,
		trace: inheritTrace,
		inheritTree,
	};
}
