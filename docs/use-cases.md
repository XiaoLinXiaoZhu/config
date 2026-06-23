# @xlxz/config — Use Case 文档

> 本文档定义 `@xlxz/config` 的全部行为规范。每个 use case 都是一个可验证的断言——"完成后 X 应该 Y"。实现完成后，文档中的每一条都应对应一个测试用例。

---

## 1. 核心概念定义

### 1.1 继承语法

`&` 前缀占据 TOML key，有两种用途，通过 key 的字符组成区分：

| 写法 | 判定 | 含义 |
|------|------|------|
| `"&" = "path"` | key 全部是 `&` | **table 级继承**：当前 table 继承 `path` 指向的 table 的全部字段 |
| `"&&" = "path"` | key 全部是 `&` | **table 级继承**（第二继承源，优先级高于 `&`） |
| `"&&&" = "path"` | key 全部是 `&` | **table 级继承**（第三继承源，以此类推） |
| `"&bool" = "path"` | `&` 后紧跟非 `&` 字符 | **字段级 pick**：当前 table 的 `bool` 字段 = `path` 指向的值 |
| `"&&bool" = "path"` | `&` 后紧跟非 `&` 字符 | **字段级 pick**（第二优先级，覆盖 `&bool`） |

**区分规则**：key 全部由 `&` 字符组成 → table 级继承源；`&` 开头但后面有其他字符 → 字段级 pick。

### 1.2 优先级

**table 级继承**（同一 table 内）：

```
自有字段  >  &&&  >  &&  >  &
```

- 自有字段：table 内直接定义的、非 `&` 前缀的字段
- `&` 前缀越多，优先级越高
- `&` 前缀越少，优先级越低

**字段级 pick**（同一 table 内、同一 field 名）：

```
&&&field  >  &&field  >  &field
```

与前缀数量规则一致。但由于 TOML 中 key 唯一，同一 table 内不会出现两个 `"&field"`；多前缀 pick 通过 `"&field"` + `"&&field"` 实现覆盖。

### 1.3 path 语义

- path 是 dot-path 字符串，如 `providers.anthropic.api_key`
- path **始终指向具体的值或 table**，不自动取同名字段
- path 指向 table 时，取整个 table 作为值（深拷贝）
- path 指向标量时，取标量值
- path 支持数组索引：纯数字段视为数组索引（如 `items.list.0` 取数组第一个元素）

### 1.4 字段级 pick 语义

- `"&<field>" = "path"` 将 `path` 指向的值赋给当前 table 的 `field` 字段
- 可用于重命名：`"&is_on" = "sample.enabled"` → `is_on = sample.enabled` 的值
- field 名和源字段名无需相同
- 字段 pick 在 table 继承之后执行，覆盖继承和自有的值

### 1.5 $VAR 替换

- 字符串值匹配 `$` 后跟字母或下划线开头、字母数字下划线组成的标识符时，触发环境变量替换
- 正则：`/^\$([A-Za-z_][A-Za-z0-9_]*)$/`
- 不要求大写——`$my_var` 同样触发替换
- `$123`（数字开头）不触发替换
- `$` 单独不触发替换
- $VAR 替换在继承解析**之前**执行，支持 `"&" = "$PRESET"` 动态切换继承源

### 1.6 架构设计

每一步处理都是一个独立的纯函数，可单独调用。`getConfig` 是组合它们的 easy api：

```
1. parseTOML(sources)        → ParsedSource[] + errors
2. mergeSources(parsed)      → merged + trace
3. resolveVars(merged, env)  → data + errors
4. resolveInherits(data)     → data + trace + inheritTree + errors
5. validateSchema(data, schema) → validated + errors
6. buildTrace(validated, trace) → finalTrace
```

使用者可以跳过或替换任何一步（如使用自定义环境变量来源而非 .env）。

---

## 2. 处理流程

```
1. TOML 解析        — smol-toml 解析为 JS 对象
2. 多源 deep merge  — 后者覆盖前者
3. $VAR 替换        — $VAR 替换为 envPool 中的值（在继承之前）
4. 继承解析         — table 级继承 + 字段级 pick
5. zod 校验         — 严格校验 + 默认值回退
6. trace 补全       — 标注 zod 默认值的来源
```

**关键顺序**：$VAR 替换在继承之前执行。这支持 `"&" = "$PRESET"` 语法——通过环境变量动态切换继承源。

---

## 3. Use Cases

### 3.1 基本解析

#### UC-1.1 解析单个 TOML 源

```toml
[settings]
strip_hint = false
```

**断言**：`getConfig(schema, [{ name: "默认", content: toml }])` 成功返回，`result.data.settings.strip_hint === false`。

#### UC-1.2 schema 默认值填充

```toml
[settings.llm]
provider = "deepseek"
api_key = "sk-test"
model = "deepseek-r1"
```

schema 中 `base_url` 有 `.default("https://api.deepseek.com")`。

**断言**：`result.data.settings.llm.base_url === "https://api.deepseek.com"`，`result.trace["settings.llm.base_url"].source === "zod default"`。

---

### 3.2 多源合并

#### UC-2.1 后者覆盖前者

源 1（默认）:
```toml
[settings]
strip_hint = true
```

源 2（全局）:
```toml
[settings.llm]
provider = "anthropic"
api_key = "sk-global"
model = "claude-opus"
```

源 3（项目）:
```toml
[settings.llm]
api_key = "sk-project"
model = "claude-sonnet"
```

**断言**：
- `result.data.settings.strip_hint === true`（来自默认）
- `result.data.settings.llm.provider === "anthropic"`（来自全局）
- `result.data.settings.llm.api_key === "sk-project"`（来自项目，覆盖全局）
- `result.trace["settings.strip_hint"].source === "默认"`
- `result.trace["settings.llm.provider"].source === "全局"`
- `result.trace["settings.llm.api_key"].source === "项目"`

---

### 3.3 $VAR 替换

#### UC-3.1 $VAR 从 envPool 解析

```toml
[settings.llm]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"
```

envPool: `{ ANTHROPIC_KEY: "sk-from-env" }`

**断言**：`result.data.settings.llm.api_key === "sk-from-env"`。

#### UC-3.2 $VAR 未找到时返回错误

envPool: `{}`（空）

**断言**：`result.success === false`，`result.errors[0].kind === "env_var_not_found"`。

#### UC-3.3 小写 $VAR 也触发替换

```toml
[settings.llm]
api_key = "$my_api_key"
```

envPool: `{ my_api_key: "sk-lowercase" }`

**断言**：`result.data.settings.llm.api_key === "sk-lowercase"`（小写环境变量名也触发替换）。

#### UC-3.4 $ 后非字母/下划线开头不触发解析

```toml
[settings.llm]
api_key = "$123not_a_var"
```

**断言**：`result.success === true`，`result.data.settings.llm.api_key === "$123not_a_var"`（原样保留）。

#### UC-3.5 $VAR 替换在继承之前执行——动态切换继承源

```toml
[base]
a = 1

[alt]
a = 2

[config]
"&" = "$PRESET"
```

envPool: `{ PRESET: "alt" }`

**断言**：`result.data.config.a === 2`（`$PRESET` 被替换为 `alt`，然后 `config` 继承 `alt`）。

---

### 3.4 table 级继承

#### UC-4.1 基本继承

```toml
[base]
a = 1
b = 2

[config]
"&" = "base"
```

**断言**：`result.data.config` 等于 `{ a: 1, b: 2 }`（`&` 键不出现在结果中）。

#### UC-4.2 继承后自有字段覆盖

```toml
[base]
a = 1
b = 2

[config]
"&" = "base"
b = 3
```

**断言**：`result.data.config` 等于 `{ a: 1, b: 3 }`（自有 `b=3` 覆盖继承的 `b=2`）。

#### UC-4.3 多继承源优先级

```toml
[base1]
a = 1
b = 1

[base2]
a = 2
b = 2

[config]
"&" = "base1"
"&&" = "base2"
```

**断言**：`result.data.config` 等于 `{ a: 2, b: 2 }`（`&&` 的 `base2` 覆盖 `&` 的 `base1`）。

#### UC-4.4 多继承源 + 自有字段

```toml
[base1]
a = 1
b = 1
c = 1

[base2]
a = 2
b = 2
c = 2

[config]
"&" = "base1"
"&&" = "base2"
a = 3
```

**断言**：`result.data.config` 等于 `{ a: 3, b: 2, c: 2 }`（自有 `a=3` > `&&` `base2` > `&` `base1`）。

#### UC-4.5 链式继承

```toml
[a]
x = 1

[b]
"&" = "a"
y = 2

[c]
"&" = "b"
z = 3
```

**断言**：`result.data.c` 等于 `{ x: 1, y: 2, z: 3 }`。

#### UC-4.6 嵌套 table 继承

```toml
[base]
id = "base"
bool = true

[base.thinking]
type = "enabled"
budget_tokens = 10000

[config]
"&" = "base"
id = "config"
```

**断言**：`result.data.config` 等于 `{ id: "config", bool: true, thinking: { type: "enabled", budget_tokens: 10000 } }`（深层合并，自有 `id` 覆盖，`thinking` 继承）。

#### UC-4.7 嵌套 table 继承后覆盖子字段

```toml
[base]
[base.thinking]
type = "enabled"
budget_tokens = 10000

[config]
"&" = "base"

[config.thinking]
budget_tokens = 5000
```

**断言**：`result.data.config.thinking` 等于 `{ type: "enabled", budget_tokens: 5000 }`（深层合并，`budget_tokens` 被覆盖，`type` 保留）。

#### UC-4.8 继承目标不存在 → 错误

```toml
[config]
"&" = "nonexistent"
```

**断言**：`result.success === false`，`result.errors[0].kind === "extend_target_not_found"`。

#### UC-4.9 继承目标不是 object → 错误

```toml
[scalar]
value = "string"

[config]
"&" = "scalar.value"
```

**断言**：`result.success === false`，`result.errors[0].kind === "extend_target_not_found"`。

#### UC-4.10 循环继承 → 错误

```toml
[a]
"&" = "b"

[b]
"&" = "a"
```

**断言**：`result.success === false`，`result.errors` 中存在 `kind === "circular_extend"` 的错误。

#### UC-4.11 & 键不出现在最终结果中

```toml
[base]
a = 1

[config]
"&" = "base"
```

**断言**：`result.data.config` 不包含 `&`、`&&` 等 key。

---

### 3.5 字段级 pick

#### UC-5.1 基本字段 pick

```toml
[sample]
bool = false
num = 42

[config.foo]
"&bool" = "sample.bool"
"&num" = "sample.num"
```

**断言**：`result.data.config.foo` 等于 `{ bool: false, num: 42 }`（`&` 键不出现）。

#### UC-5.2 字段 pick 重命名

```toml
[sample]
enabled = true

[config.foo]
"&is_on" = "sample.enabled"
```

**断言**：`result.data.config.foo` 等于 `{ is_on: true }`。

#### UC-5.3 字段 pick 目标是 table → 取整个 table

```toml
[sample]
[sample.nested]
x = 1
y = 2

[config.foo]
"&data" = "sample.nested"
```

**断言**：`result.data.config.foo.data` 等于 `{ x: 1, y: 2 }`（深拷贝整个 table）。

#### UC-5.4 字段 pick 目标不存在 → 错误

```toml
[config.foo]
"&bool" = "nonexistent.path"
```

**断言**：`result.success === false`，`result.errors[0].kind === "extend_target_not_found"`。

#### UC-5.5 字段 pick 与 table 继承共存

```toml
[base]
id = "base"
bool = true

[config.sample]
bool = false

[config.foo]
"&" = "base"
id = "foo"
"&bool" = "config.sample.bool"
```

**断言**：`result.data.config.foo` 等于 `{ id: "foo", bool: false }`。

处理顺序：先 table 继承（得到 `id="base"`, `bool=true`）→ 再应用自有字段（`id="foo"` 覆盖）→ 再应用字段 pick（`bool=false` 覆盖）。

#### UC-5.6 字段 pick 支持数组索引

```toml
[items]
list = ["a", "b", "c"]

[config]
"&first" = "items.list.0"
"&third" = "items.list.2"
```

**断言**：`result.data.config.first === "a"`，`result.data.config.third === "c"`。

#### UC-5.7 字段 pick 多前缀优先级

```toml
[source1]
a = "s1"

[source2]
a = "s2"

[config]
"&a" = "source1.a"
"&&a" = "source2.a"
```

**断言**：`result.data.config.a === "s2"`（`&&a` 优先级高于 `&a`）。

#### UC-5.8 字段 pick 覆盖继承值

```toml
[base]
value = "inherited"

[override]
value = "picked"

[config]
"&" = "base"
"&value" = "override.value"
```

**断言**：`result.data.config.value === "picked"`（字段 pick 在 table 继承之后执行，覆盖继承值）。

---

### 3.6 trace 来源溯源

#### UC-6.1 trace 记录多源合并来源

```toml
# 源: 默认
[settings]
strip_hint = true
```
```toml
# 源: 项目
[settings]
strip_hint = false
```

**断言**：
- `result.trace["settings.strip_hint"].value === false`
- `result.trace["settings.strip_hint"].source === "项目"`

#### UC-6.2 trace 记录 zod 默认值

```toml
[settings.llm]
provider = "deepseek"
api_key = "sk-test"
model = "deepseek-r1"
```

schema 中 `base_url` 有默认值。

**断言**：
- `result.trace["settings.llm.base_url"].value === "https://api.deepseek.com"`
- `result.trace["settings.llm.base_url"].source === "zod default"`

#### UC-6.3 trace 记录继承来源

```toml
[base]
a = 1

[config]
"&" = "base"
b = 2
```

**断言**：
- `result.trace["config.a"].value === 1`
- `result.trace["config.a"].source === "配置源名"`（继承字段的 source 是原始配置源名，不是 "base"）
- `result.trace["config.b"].value === 2`
- `result.trace["config.b"].source === "配置源名"`

#### UC-6.4 trace 记录字段 pick 来源

```toml
[sample]
enabled = true

[config.foo]
"&is_on" = "sample.enabled"
```

**断言**：
- `result.trace["config.foo.is_on"].value === true`
- `result.trace["config.foo.is_on"].source === "配置源名"`（pick 字段的 source 是被 pick 值的原始来源）

---

### 3.7 inheritTree 元数据

#### UC-7.1 inheritTree 记录 table 继承结构

```toml
[base]
a = 1

[config]
"&" = "base"
"&&" = "alt"
b = 2
```

**断言**：
- `result.inheritTree["config"].extends` 包含 `{ path: "base", priority: 1 }` 和 `{ path: "alt", priority: 2 }`
- `result.inheritTree["config"].ownFields` 包含 `"b"`
- `result.inheritTree["config"].picks` 为空数组

#### UC-7.2 inheritTree 记录字段 pick 结构

```toml
[sample]
bool = false

[config]
"&bool" = "sample.bool"
"&&num" = "sample.num"
```

**断言**：
- `result.inheritTree["config"].picks` 包含 `{ field: "bool", path: "sample.bool", priority: 1 }` 和 `{ field: "num", path: "sample.num", priority: 2 }`
- `result.inheritTree["config"].extends` 为空数组

---

### 3.8 错误处理

#### UC-8.1 无效 TOML 语法 → 错误

```
not valid toml {{{
```

**断言**：`result.success === false`，`result.errors[0].kind === "toml_parse_error"`。

#### UC-8.2 schema 验证失败 → 错误

```toml
[settings.llm]
provider = "anthropic"
api_key = "sk-test"
# 缺少 model 字段
```

**断言**：`result.success === false`，`result.errors[0].kind === "schema_validation_error"`。

#### UC-8.3 多个错误同时返回

```toml
[config]
"&" = "nonexistent1"
"&&" = "nonexistent2"
```

**断言**：`result.success === false`，`result.errors` 包含至少 2 个 `extend_target_not_found` 错误。

---

### 3.9 集成场景

#### UC-9.1 全局定义 base，项目通过继承引用

源 1（默认）:
```toml
[settings]
strip_hint = true
```

源 2（全局）:
```toml
[base]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"

[settings.llm]
"&" = "base"

[settings.editor]
"&" = "base"
model = "gpt-4o"
```

源 3（项目）:
```toml
[settings]
strip_hint = false
```

envPool: `{ ANTHROPIC_KEY: "sk-ant-xxx" }`

**断言**：
- `result.data.settings.llm.provider === "anthropic"`
- `result.data.settings.llm.api_key === "sk-ant-xxx"`
- `result.data.settings.llm.model === "claude-opus"`
- `result.data.settings.editor.provider === "anthropic"`
- `result.data.settings.editor.model === "gpt-4o"`（自有覆盖继承）
- `result.data.settings.strip_hint === false`
- `result.trace["settings.strip_hint"].source === "项目"`
- `result.trace["settings.llm.model"].source === "全局"`（继承自 base，base 来自全局源）

#### UC-9.2 $PRESET 动态切换继承源

源（全局）:
```toml
[dev]
debug = true
level = "debug"

[prod]
debug = false
level = "info"

[config]
"&" = "$ENV"
```

envPool: `{ ENV: "prod" }`

**断言**：`result.data.config.debug === false`，`result.data.config.level === "info"`（`$ENV` 替换为 `prod`，继承 `prod` table）。

---

## 4. 不确定点（已全部解决）

### 4.1 字段 pick 是否支持数组索引

**结论**：支持。dot-path 中纯数字段视为数组索引。

### 4.2 字段级 pick 优先级

**结论**：与前缀数量规则一致。`&field` < `&&field` < `&&&field`。同一 table 内通过多前缀 key 实现 pick 覆盖。多来源合并时后者覆盖前者。

### 4.3 继承字段的 trace source

**结论**：trace.source 记录原始配置源名（如"全局"），保持与现有行为一致。继承 vs 自有的区分由 inheritTree 元数据提供，不污染 trace。

### 4.4 配置编辑能力

**结论**：当前版本不纳入编辑 API。提供 inheritTree 元数据记录继承结构（继承源列表、自有字段、pick 列表），使用者可基于此信息自行实现编辑逻辑。如将来需求明确，可基于 inheritTree 设计独立的 ConfigEditor 模块。
