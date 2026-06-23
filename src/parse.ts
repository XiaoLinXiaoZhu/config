/**
 * @xlxz/config parse — 步骤 1：TOML 解析
 *
 * 用 smol-toml 解析每个 ConfigSource。解析失败返回错误，跳过该源继续。
 */

import { parse as parseTOML } from "smol-toml";
import type { ConfigError, ConfigSource, ParsedSource } from "./types";

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 解析所有 TOML 配置源。
 *
 * 解析失败的源跳过（不进入后续合并），其余正常解析。
 * 如果有错误，调用方应检查 errors 数组决定是否继续。
 */
export function parseTOMLSources(sources: ReadonlyArray<ConfigSource>): {
	sources: ParsedSource[];
	errors: ConfigError[];
} {
	const parsed: ParsedSource[] = [];
	const errors: ConfigError[] = [];

	for (const source of sources) {
		let data: unknown;
		try {
			data = parseTOML(source.content);
		} catch (e) {
			errors.push({
				kind: "toml_parse_error" as const,
				sourceName: source.name,
				message: `${source.name}: TOML 解析失败 — ${e instanceof Error ? e.message : String(e)}`,
			});
			continue;
		}
		if (!isObject(data)) {
			errors.push({
				kind: "toml_parse_error" as const,
				sourceName: source.name,
				message: `${source.name}: TOML 顶层必须是 object`,
			});
			continue;
		}
		parsed.push({ name: source.name, data });
	}

	return { sources: parsed, errors };
}
