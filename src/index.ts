/**
 * @xlxz/config — TOML 配置加载器
 *
 * 支持 & 前缀继承机制、zod 校验、来源溯源。
 * 每一步处理都是独立的纯函数，可单独调用。
 */

// easy api
export { getConfig } from "./config.ts";
export { resolveInherits } from "./inherit.ts";
export { mergeSources } from "./merge.ts";
// 纯函数步骤
export { parseTOMLSources } from "./parse.ts";
// 工具
export { deepClone, getByPath } from "./path.ts";
export { buildFinalTrace } from "./trace.ts";
// 类型
export type {
	ConfigError,
	ConfigFailure,
	ConfigResult,
	ConfigSource,
	ConfigSuccess,
	FieldPick,
	InheritSource,
	InheritTree,
	InheritTreeEntry,
	ParsedSource,
	Trace,
	TraceEntry,
} from "./types.ts";
export { validateSchema } from "./validate.ts";
export { resolveVars } from "./vars.ts";
