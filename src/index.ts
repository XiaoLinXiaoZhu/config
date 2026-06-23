/**
 * @xlxz/config — TOML 配置加载器
 *
 * 支持 & 前缀继承机制、zod 校验、来源溯源。
 * 每一步处理都是独立的纯函数，可单独调用。
 */

// easy api
export { getConfig } from "./config";
export { resolveInherits } from "./inherit";
export { mergeSources } from "./merge";
// 纯函数步骤
export { parseTOMLSources } from "./parse";
// 工具
export { deepClone, getByPath } from "./path";
export { buildFinalTrace } from "./trace";
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
} from "./types";
export { validateSchema } from "./validate";
export { resolveVars } from "./vars";
