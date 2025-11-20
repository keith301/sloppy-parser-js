# Examples - What sloppy-parser-js Can Handle

## ✅ Valid JSON (100% passing)

### Minimal Valid JSON
```javascript
parseJson('{"name":"Keith","age":42}')
// → { name: "Keith", age: 42 }
```

### Valid Arrays
```javascript
parseJson('["first","second","third"]')
// → ["first", "second", "third"]
```

### Nested Structures
```javascript
parseJson('{"items": [1, 2, 3], "meta": {"total": 3}}')
// → { items: [1, 2, 3], meta: { total: 3 } }
```

### With Text Preamble
```javascript
parseRawOutput(`Here's the data:
{"status": "success"}`)
// → [
//     { type: "text", text: "Here's the data:" },
//     { type: "object", object: { status: "success" } }
//   ]
```

### Multiple Objects with Narration
```javascript
parseJson(`First tool:
{"tool": "read"}
Second tool:
{"tool": "write"}`)
// → [{ tool: "read" }, { tool: "write" }]
```

---

## ✅ Valid YAML (100% passing)

### Simple Key-Value
```javascript
parseJson(`name: Keith
age: 42
active: true`)
// → { name: "Keith", age: 42, active: true }
```

### YAML Lists
```javascript
parseJson(`items:
- apple
- banana
- cherry`)
// → { items: ["apple", "banana", "cherry"] }
```

### With Inconsistent Indentation
```javascript
parseJson(`items:
 - one
  - two
    - three`)
// → { items: ["one", "two", "three"] }
```

---

## ✅ Broken JSON - Repaired (88% passing)

### Missing Quotes
```javascript
parseJson('{foo: bar, baz: qux}')
// → { foo: "bar", baz: "qux" }
```

### Missing Commas
```javascript
parseJson('{a: 1 b: 2 c: 3}')
// → { a: 1, b: 2, c: 3 }
```

### Inline Comments
```javascript
parseJson('{name: Keith  # obviously}')
// → { name: "Keith" }
```

### Multiline Bare Values
```javascript
parseJson(`{"a": 1, "b":
Oops I forgot}`)
// → { a: 1, b: "Oops I forgot" }
```

### Emoji Values
```javascript
parseJson('{status: 👍}')
// → { status: "👍" }
```

### Back-to-Back Objects
```javascript
parseJson('{"a":1}{"b":2}')
// → [{ a: 1 }, { b: 2 }]
```

### Multiword Bare Keys
```javascript
parseJson('{btw I love YAML: yes}')
// → { "btw I love YAML": "yes" }
```

---

## 🚧 Known Limitations (4 edge cases)

### Nested YAML with Indentation
```javascript
// Not yet supported - needs indentation tracking
parseJson(`person:
  name: Keith
  details:
    age: 42`)
// Current: Flattens structure
// Planned: Proper nesting
```

### Unclosed Fences with Mixed Content
```javascript
// Partially working
parseJson(`\`\`\`json
{foo: "bar"
and then: more stuff`)
// Needs: Better fence boundary detection
```

---

## 📊 Overall Success Rate

- **Valid JSON:** 8/8 (100%)
- **Valid YAML:** 5/5 (100%)
- **Broken JSON/YAML:** 25/29 (86%)
- **Total:** 38/42 (90.5%)

