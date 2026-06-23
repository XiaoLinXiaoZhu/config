# @xlxz/config

TOML 配置加载器，支持 `&` 前缀继承机制、zod 校验、来源溯源。

## 安装

```bash
bun add @xlxz/config
# 或
npm install @xlxz/config
```

## 快速开始

```typescript
import { z } from "zod";
import { getConfig } from "@xlxz/config";

const schema = z.object({
  settings: z.object({
    debug: z.boolean().default(false),
    llm: z.object({
      provider: z.string(),
      api_key: z.string(),
      model: z.string(),
      base_url: z.string().default("https://api.openai.com"),
    }),
  }),
});

const result = getConfig(schema, [
  {
    name: "全局",
    content: `
[settings.llm]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"
`,
  },
  {
    name: "项目",
    content: `
[settings]
debug = true

[settings.llm]
model = "claude-sonnet"
`,
  },
], { ANTHROPIC_KEY: "sk-xxx" });

if (result.success) {
  console.log(result.data.settings.llm.api_key);   // "sk-xxx"
  console.log(result.data.settings.llm.model);     // "claude-sonnet"
  console.log(result.data.settings.debug);          // true

  // 每个字段都可溯源
  console.log(result.trace["settings.llm.model"].source);  // "项目"
  console.log(result.trace["settings.llm.base_url"].source); // "zod default"
} else {
  for (const error of result.errors) {
    console.error(error.message);
  }
}
```

## 核心特性

### `&` 前缀继承

用 `&` 前缀替代传统的 `extend` 字段，避免和大多数配置冲突。

#### table 级继承

```toml
[base]
provider = "anthropic"
api_key = "sk-ant"
model = "claude-opus"

[settings.llm]
"&" = "base"            # 继承 base 全部字段

[settings.editor]
"&" = "base"            # 也继承 base
model = "gpt-4o"        # 自有字段覆盖
```

多继承源，`&` 越多优先级越高：

```toml
[config]
"&" = "base1"           # 最低优先级
"&&" = "base2"           # 覆盖 base1
"&&&" = "base3"          # 覆盖 base2
# 自有字段优先级最高
```

链式继承：

```toml
[a]
x = 1

[b]
"&" = "a"               # b 继承 a
y = 2

[c]
"&" = "b"               # c 继承 b（已含 a 的字段）
z = 3
# c 最终 = { x: 1, y: 2, z: 3 }
```

#### 字段级 pick

精准 pick 单个字段，可重命名：

```toml
[sample]
enabled = true
timeout = 30

[config]
"&is_on" = "sample.enabled"     # is_on = true（重命名）
"&wait" = "sample.timeout"       # wait = 30（重命名）
```

字段 pick 支持数组索引：

```toml
[items]
list = ["a", "b", "c"]

[config]
"&first" = "items.list.0"       # first = "a"
```

字段 pick 在 table 继承之后执行，覆盖继承值：

```toml
[base]
value = "inherited"

[override]
value = "picked"

[config]
"&" = "base"                    # 继承: value = "inherited"
"&value" = "override.value"      # pick 覆盖: value = "picked"
```

### `$VAR` 环境变量替换

```toml
[settings.llm]
api_key = "$ANTHROPIC_KEY"      # 从 envPool 替换
```

不要求大写，`$my_var` 同样触发替换。

**动态切换继承源**——`$VAR` 在继承之前替换：

```toml
[dev]
debug = true

[prod]
debug = false

[config]
"&" = "$ENV"                    # 通过环境变量切换继承源
```

```typescript
// envPool: { ENV: "prod" }
// → config 继承 prod，debug = false
```

### zod 校验 + 默认值回退

```typescript
const schema = z.object({
  settings: z.object({
    timeout: z.number().default(30),    // 未提供时填充默认值
    retries: z.number().min(0).max(5),
  }),
});
```

zod 校验失败时返回结构化错误，不抛异常。

### 来源溯源

每个字段都记录值来源：

```typescript
result.trace["settings.llm.model"]
// { value: "claude-sonnet", source: "项目" }

result.trace["settings.timeout"]
// { value: 30, source: "zod default" }
```

### InheritTree 元数据

记录每个 table 的继承结构，供上层使用：

```typescript
result.inheritTree["config"]
// {
//   extends: [
//     { path: "base1", priority: 1 },
//     { path: "base2", priority: 2 },
//   ],
//   ownFields: ["timeout"],
//   picks: [{ field: "value", path: "override.value", priority: 1 }],
// }
```

## 纯函数 API

每一步都是独立纯函数，可单独调用：

```typescript
import {
  parseTOMLSources,
  mergeSources,
  resolveVars,
  resolveInherits,
  validateSchema,
  buildFinalTrace,
} from "@xlxz/config";

// 步骤 1: TOML 解析
const { sources, errors } = parseTOMLSources(configSources);

// 步骤 2: 多源合并
const { merged, trace } = mergeSources(sources);

// 步骤 3: $VAR 替换
const { data, errors: varErrors } = resolveVars(merged, envPool, trace);

// 步骤 4: 继承解析
const { data: inherited, inheritTree, errors: inheritErrors } = resolveInherits(data, trace);

// 步骤 5: zod 校验
const { data: validated, errors: validateErrors } = validateSchema(inherited, schema);

// 步骤 6: trace 补全
buildFinalTrace(validated, "", trace);
```

`getConfig` 是组合这些步骤的 easy api。

## 处理流程

```
TOML 解析 → 多源合并 → $VAR 替换 → 继承解析 → zod 校验 → trace 补全
```

关键顺序：`$VAR` 替换在继承解析**之前**执行，支持 `"&" = "$PRESET"` 动态切换继承源。

## 优先级总览

```
字段 pick > 自有字段 > table 继承
```

table 继承内部：自有字段 > `&&&` > `&&` > `&`

字段 pick 内部：`&&&field` > `&&field` > `&field`

## 错误类型

```typescript
type ConfigError =
  | { kind: "toml_parse_error"; sourceName: string; message: string }
  | { kind: "env_var_not_found"; varName: string; sourceName: string; message: string }
  | { kind: "extend_target_not_found"; targetPath: string; parentPath: string; message: string }
  | { kind: "circular_extend"; chain: string[]; message: string }
  | { kind: "schema_validation_error"; message: string }
```

## License

MIT
