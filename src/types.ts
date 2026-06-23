/**
 * @xlxz/config types — 公共类型定义
 */

// ── ConfigSource ──

export interface ConfigSource {
	/** 来源名称，用于错误消息和 trace（如 "全局"、"项目"） */
	name: string;
	/** TOML 文本内容 */
	content: string;
}

// ── ParsedSource ──

export interface ParsedSource {
	name: string;
	data: Record<string, unknown>;
}

// ── Trace ──

export interface TraceEntry {
	value: unknown;
	source: string;
}

/** dot-path → 来源信息 */
export type Trace = Record<string, TraceEntry>;

// ── InheritTree ──

export interface InheritSource {
	/** 继承目标 dot-path */
	path: string;
	/** & 的数量（1 = &, 2 = &&, ...） */
	priority: number;
}

export interface FieldPick {
	/** 被赋值的字段名 */
	field: string;
	/** pick 来源 dot-path */
	path: string;
	/** & 的数量 */
	priority: number;
}

export interface InheritTreeEntry {
	/** table 级继承源列表 */
	extends: InheritSource[];
	/** 自有字段名列表 */
	ownFields: string[];
	/** 字段级 pick 列表 */
	picks: FieldPick[];
}

/** table dot-path → 继承结构 */
export type InheritTree = Record<string, InheritTreeEntry>;

// ── 错误类型（可辨联合） ──

export type ConfigError =
	| TOMLParseError
	| EnvVarNotFoundError
	| ExtendTargetNotFoundError
	| CircularExtendError
	| SchemaValidationError;

export interface TOMLParseError {
	kind: "toml_parse_error";
	sourceName: string;
	message: string;
}

export interface EnvVarNotFoundError {
	kind: "env_var_not_found";
	varName: string;
	/** 哪个配置源引用了这个变量 */
	sourceName: string;
	message: string;
}

export interface ExtendTargetNotFoundError {
	kind: "extend_target_not_found";
	targetPath: string;
	parentPath: string;
	message: string;
}

export interface CircularExtendError {
	kind: "circular_extend";
	/** 环路径 */
	chain: string[];
	message: string;
}

export interface SchemaValidationError {
	kind: "schema_validation_error";
	message: string;
}

// ── Result ──

export interface ConfigSuccess<T> {
	success: true;
	data: T;
	trace: Trace;
	inheritTree: InheritTree;
}

export interface ConfigFailure {
	success: false;
	errors: ConfigError[];
}

export type ConfigResult<T> = ConfigSuccess<T> | ConfigFailure;
