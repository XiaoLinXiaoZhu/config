# @xlxz/config — 设计文档

> TOML 配置加载器，支持 `&` 前缀继承机制、zod 校验、来源溯源。技术栈与 n0n 一致（bun + TypeScript + biome）。

---

## 1. 架构概览

### 1.1 纯函数管道

每一步处理都是独立的纯函数，可单独调用。`getConfig` 组合它们形成 easy api。

```
ConfigSource[] ──→ parseTOML ──→ ParsedSource[]
                                      │
                                      ▼
                              mergeSources ──→ { merged, trace }
                                      │
                                      ▼
                        resolveVars(merged, envPool) ──→ { data, errors }
                                      │
                                      ▼
                          resolveInherits(data) ──→ { data, trace, inheritTree, errors }
                                      │
                                      ▼
                    validateSchema(data, schema) ──→ { validated, errors }
                                      │
                                      ▼
                      buildTrace(validated, trace) ──→ finalTrace
```

### 1.2 设计原则

- **纯函数**：每步输入→输出，无副作用，可独立测试
- **可组合**：使用者可替换任何一步（如自定义环境变量来源）
- **不可变**：函数返回新值，不修改输入
- **来源可追踪**：trace 记录每个字段的值来源

---

## 2. 模块划分

```
src/
  index.ts          重新导出公共 API
  types.ts          所有公共类型定义
  path.ts           dot-path 工具（getByPath，支持数组索引）
  parse.ts          步骤 1：TOML 解析
  merge.ts          步骤 2：多源 deep merge + trace 构建
  vars.ts           步骤 3：$VAR 替换
  inherit.ts        步骤 4：继承解析（table 级 + 字段级 pick）
  inherit-tree.ts   inheritTree 元数据构建
  validate.ts       步骤 5：zod 校验
  trace.ts          步骤 6：trace 补全
  config.ts         getConfig easy api
```

---

## 3. 纯函数 API

### 3.1 parseTOML

```typescript
function parseTOML(sources: ReadonlyArray<ConfigSource>): {
  sources: ParsedSource[];
  errors: ConfigError[];
}
```

用 smol-toml 解析每个 ConfigSource 的 content。解析失败返回 `toml_parse_error`，跳过该源继续解析其余。

### 3.2 mergeSources

```typescript
function mergeSources(
  parsedSources: ReadonlyArray<ParsedSource>,
): { merged: Record<string, unknown>; trace: Trace }
```

多源 deep merge，后者覆盖前者。同时构建 trace，记录每个字段的值和来源（ConfigSource.name）。

### 3.3 resolveVars

```typescript
function resolveVars(
  data: Record<string, unknown>,
  envPool: Readonly<Record<string, string>>,
  trace: Trace,
): { data: Record<string, unknown>; errors: ConfigError[] }
```

遍历所有字符串值，匹配 `/^\$([A-Za-z_][A-Za-z0-9_]*)$/`。匹配则从 envPool 替换，未找到则返回 `env_var_not_found`。

### 3.4 resolveInherits

```typescript
function resolveInherits(
  data: Record<string, unknown>,
  trace: Trace,
): {
  data: Record<string, unknown>;
  trace: Trace;
  inheritTree: InheritTree;
  errors: ConfigError[];
}
```

分两阶段：
1. **table 级继承**：迭代解析所有 `&`/`&&`/`&&&`... 继承节点。含链式继承、循环检测、深层合并。按优先级从低到高合并继承源，自有字段作为最高优先级覆盖。
2. **字段级 pick**：一次性解析所有 `&field`/`&&field`... pick 节点。按优先级从低到高应用。path 指向的值通过 getByPath 获取（支持数组索引）。

### 3.5 validateSchema

```typescript
function validateSchema<T>(
  data: Record<string, unknown>,
  schema: z.ZodType<T>,
): { data: T; errors: ConfigError[] }
```

用 zod schema 校验。失败返回 `schema_validation_error`（含 zod issues 详情）。成功返回类型安全的数据，zod 默认值自动填充。

### 3.6 buildTrace

```typescript
function buildTrace(validated: unknown, trace: Trace): Trace
```

遍历校验后的数据，为 trace 中缺失的字段补充来源（标为 `"zod default"`）。

### 3.7 getConfig（easy api）

```typescript
function getConfig<T>(
  schema: z.ZodType<T>,
  sources: ConfigSource[],
  envPool?: Record<string, string>,
): ConfigResult<T>
```

按顺序组合上述 6 个纯函数。任一步骤出错则提前返回错误。

---

## 4. 数据结构

### 4.1 ConfigSource

```typescript
interface ConfigSource {
  name: string;       // 来源名称，用于 trace
  content: string;    // TOML 文本
}
```

### 4.2 ParsedSource

```typescript
interface ParsedSource {
  name: string;
  data: Record<string, unknown>;
}
```

### 4.3 Trace

```typescript
interface TraceEntry {
  value: unknown;
  source: string;    // ConfigSource.name 或 "zod default"
}
type Trace = Record<string, TraceEntry>;  // dot-path → TraceEntry
```

### 4.4 InheritTree

```typescript
interface InheritSource {
  path: string;       // 继承目标 dot-path
  priority: number;   // & 的数量（1 = &, 2 = &&, ...）
}
interface FieldPick {
  field: string;     // 被赋值的字段名
  path: string;       // pick 来源 dot-path
  priority: number;   // & 的数量
}
interface InheritTreeEntry {
  extends: InheritSource[];   // table 级继承源列表
  ownFields: string[];         // 自有字段名列表
  picks: FieldPick[];          // 字段级 pick 列表
}
type InheritTree = Record<string, InheritTreeEntry>;  // table dot-path → entry
```

### 4.5 ConfigResult

```typescript
interface ConfigSuccess<T> {
  success: true;
  data: T;
  trace: Trace;
  inheritTree: InheritTree;
}
interface ConfigFailure {
  success: false;
  errors: ConfigError[];
}
type ConfigResult<T> = ConfigSuccess<T> | ConfigFailure;
```

### 4.6 ConfigError（可辨联合）

```typescript
| { kind: "toml_parse_error"; sourceName: string; message: string }
| { kind: "env_var_not_found"; varName: string; sourceName: string; message: string }
| { kind: "extend_target_not_found"; targetPath: string; parentPath: string; message: string }
| { kind: "circular_extend"; chain: string[]; message: string }
| { kind: "schema_validation_error"; message: string }
```

---

## 5. 继承解析算法

### 5.1 key 分类

```
isTableInheritKey(key) = key 非空 && key 的每个字符都是 &
isFieldPickKey(key)    = key 以 & 开头 && 存在非 & 字符
```

### 5.2 table 级继承解析（阶段 A）

迭代算法（最多 100 轮）：

```
每轮:
  1. 查找所有 table 继承节点（key 全是 & 的条目）
  2. 如果没有节点 → 完成
  3. 对每个节点:
     a. target = getByPath(root, path)
     b. target 不存在或不是 object → 错误，删除该 & 键
     c. target 自身还有未解析的 & 继承 → 跳过，等下一轮
     d. 检测循环（selfPath → targetPath 已访问过）→ 错误
     e. 按 priority 从低到高合并继承源
     f. 自有字段覆盖继承结果
     g. 删除 & 键
     h. 更新 trace（继承字段复制原始 source）
  4. 如果本轮无进展 → 检测剩余循环 → 返回错误
```

### 5.3 字段级 pick 解析（阶段 B）

阶段 A 完成后，所有继承已解析完毕。一次性遍历：

```
对每个 table:
  1. 收集所有字段 pick 节点（&field / &&field / ...）
  2. 按 priority 从低到高排序
  3. 对每个 pick:
     a. value = getByPath(root, path)
     b. value 不存在 → 错误
     c. table[field] = 深拷贝(value)
     d. 更新 trace（pick 字段的 source = 被取值的原始 source）
     e. 删除 &field 键
```

### 5.4 优先级总结

```
字段 pick（阶段 B）> 自有字段 > table 继承（阶段 A）
```

table 继承内部：自有字段 > &&& > && > &
字段 pick 内部：&&&field > &&field > &field

---

## 6. $VAR 替换

- 正则：`/^\$([A-Za-z_][A-Za-z0-9_]*)$/`
- 在继承解析之前执行
- 支持 `"&" = "$PRESET"` 动态切换继承源
- 未找到环境变量返回 `env_var_not_found` 错误

---

## 7. trace 规则

| 场景 | trace.source |
|------|-------------|
| 字段来自 ConfigSource | ConfigSource.name |
| 字段通过 table 继承获得 | 原始 ConfigSource.name（继承源字段的来源） |
| 字段通过 pick 获得 | 被取值的原始 ConfigSource.name |
| 字段由 zod 默认值填充 | `"zod default"` |
