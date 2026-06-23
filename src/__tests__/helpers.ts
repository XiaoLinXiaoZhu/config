/**
 * 测试工具函数
 */

import type { ConfigSource } from "../types";

/**
 * 从 TOML 文本创建 ConfigSource。
 */
export function src(name: string, content: string): ConfigSource {
	return { name, content };
}

/**
 * 创建带名称的 ConfigSource 数组。
 */
export function sources(...items: Array<[string, string]>): ConfigSource[] {
	return items.map(([name, content]) => ({ name, content }));
}
