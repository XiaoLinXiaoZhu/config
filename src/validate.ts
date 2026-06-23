/**
 * @xlxz/config validate — 步骤 5：zod 校验
 */

import type { z } from "zod";
import type { ConfigError } from "./types.ts";

/**
 * 用 zod schema 校验数据。失败返回错误（含 zod issues 详情）。
 */
export function validateSchema<T>(
	data: Record<string, unknown>,
	schema: z.ZodType<T>,
): { data: T; errors: ConfigError[] } {
	const errors: ConfigError[] = [];

	let validated: T;
	try {
		validated = schema.parse(data);
	} catch (e) {
		const zodError = e as {
			issues?: Array<{ message: string; path: (string | number)[] }>;
		};
		const message = zodError.issues
			? zodError.issues
					.map((i) => `${i.path.join(".")}: ${i.message}`)
					.join("; ")
			: String(e);
		errors.push({
			kind: "schema_validation_error" as const,
			message,
		});
		return { data: data as unknown as T, errors };
	}

	return { data: validated, errors };
}
