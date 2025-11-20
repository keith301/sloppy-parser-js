# sloppy-parser-js  
### *Hugging your data since 2025*

[![Tests](https://img.shields.io/badge/tests-38%2F38%20passing-success)]()
[![JSON Support](https://img.shields.io/badge/JSON%20repair-100%25-success)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

**100% of JSON horrors handled | YAML is experimental**

Have you ever asked an LLM for JSON and received:

- JSON-ish  
- YAML-ish  
- spiritual guidance  
- a TED talk  
- {foo: "bar" btw I'll do that tool call now}  
- or my personal favorite:  
  Here's your JSON! {don't: worry, no: quotes}

Yeah. Same.

**sloppy-parser-js** is a zero-dependency, browser-first parser that takes whatever “structured output” your AI model *thinks* it produced…  
and gently repairs it into strict JSON **without losing the surrounding narration or tool-call context**.

It doesn’t judge.  
It just fixes things.

---

# Why This Exists

Because every agent framework on Earth requires:
- clean JSON  
- tool calls extracted from narration  
- no hallucinated backticks  
- and definitely no “btw” inside your {}

But LLMs…  
LLMs are like:

"Sure here's your JSON 🙃"  
{foo:bar baz:qux # lmao}

So this library:
- segments the output into text vs object  
- repairs objects using soft grammar + read-repair  
- returns strict JSON (single or array)  
- preserves narration perfectly  

It’s not strict.  
It’s not pedantic.  
It’s a **permission system** that tries to understand the LLM’s *intent*.

---

# TL;DR Example

```javascript
// Missing quotes and commas? No problem.
parseJson("{foo:bar baz:qux}")  
→ { foo: "bar", baz: "qux" }

// LLM narration + tool calls? Handled perfectly.
parseRawOutput("I'll do it\n{tool: first}\nand also\n{tool: second}")  
→ [
  { type: "text", text: "I'll do it" },
  { type: "object", object: { tool: "first" } },
  { type: "text", text: "and also" },
  { type: "object", object: { tool: "second" } }
]

// Just want the objects?
parseJson("I'll do it\n{tool: first}\nand also\n{tool: second}")  
→ [{ tool: "first" }, { tool: "second" }]
```

---

# What This Actually Does

## 1) Segments your LLM output  
Into a deterministic sequence of:

- {type:"text", text:"..."}  
- {type:"object", object:{…}, raw:"...", repairedText:"..."}  

Preserving:
- order  
- narration  
- derailments  
- tool calls  
- the entire chaotic vibe

Perfect for UI and agent pipelines.

---

## 2) Repairs the objects  
With techniques ranging from polite nudges to spiritual duct tape:

- ✅ quote unquoted keys  
- ✅ quote unquoted values  
- ✅ infer commas  
- ✅ remove inline comments  
- ✅ normalize Unicode quotes  
- ✅ merge multiword keys  
- ✅ fix mismatched braces  
- ✅ handle basic YAML patterns (experimental)  
- ✅ reconstruct arrays  
- ✅ multiline bare values
- ✅ emoji and unicode text
- ✅ drop trailing nonsense  

Then converts repaired text → strict JSON → JSON.parse().

If JSON-ish fails → try YAML-ish (experimental).  
If everything fails → returns null with helpful warnings.

---

## 3) Outputs usable JSON

Rules:
- 0 objects → null  
- 1 object → return it  
- many objects → return array (ordered)  

Great for:
- workflow engines  
- tool-call runners  
- RIAs/agent UIs  
- streaming interpreters  
- anywhere you need “just the structured bits please”

---

# Install

npm install sloppy-parser-js

---

# Philosophy

### **This is not a strict parser.**  
Strict parsing died on impact.

### **Grammar is soft. Repairs are contextual.**  
If you're parsing a VALUE, you know a comment isn’t part of it.

Example:  
name: Keith  # obviously  
→ "name": "Keith"

### **Text stays text. Objects become JSON.**  
No more “sorry I tried to split the narration from the tool call myself.”

### **Zero dependencies.**  
Because the moment you import a YAML library,  
someone opens an issue about anchors, tags, or multi-doc streams.

---

# Real LLM Chaos (and how it parses)

Input:
I think this will work...
{foo:1}
Anyway let me tell you about
the time I broke JSON parsing
{bar:2 baz:3}
Okay I'm done now

Raw output (segmented):
text → object → text → object → text

JSON projection:
[{foo:1}, {bar:2, baz:3}]

---

---

# Real JSON Horrors We Handle

All of these parse correctly and produce strict JSON:

```javascript
// Missing quotes everywhere
parseJson('{foo:bar baz:qux}')  
→ { foo: "bar", baz: "qux" }

// Missing commas
parseJson('{a:1 b:2 c:3}')  
→ { a: 1, b: 2, c: 3 }

// Inline comments
parseJson('{name: Keith  # obviously}')  
→ { name: "Keith" }

// Multiword bare keys
parseJson('{btw I love YAML: yes}')  
→ { "btw I love YAML": "yes" }

// Multiline values
parseJson('{"a": 1, "b":\nOops I forgot}')  
→ { a: 1, b: "Oops I forgot" }

// Emoji values
parseJson('{status: 👍}')  
→ { status: "👍" }

// Back-to-back objects
parseJson('{"a":1}{"b":2}')  
→ [{ a: 1 }, { b: 2 }]

// Nested chaos
parseJson('{outer:{inner:value no:quotes}}')  
→ { outer: { inner: "value", no: "quotes" } }

// LLM narration preserved
parseRawOutput('Here is the data:\n{foo: bar}\nThat was it!')  
→ [
  { type: "text", text: "Here is the data:" },
  { type: "object", object: { foo: "bar" } },
  { type: "text", text: "That was it!" }
]
```

## Test Results

**38/38 active tests passing (100%)**

- ✅ **Valid JSON:** 8/8 (100%)
- ✅ **Valid YAML (basic):** 5/5 (100%)  
- ✅ **Broken JSON repaired:** 25/25 (100%)

**Note:** YAML support is **experimental**. Nested indentation-based YAML is not yet supported.  
Use this library primarily for JSON repair and extraction.

See [EXAMPLES.md](./EXAMPLES.md) for comprehensive examples.

---

# API

parseRawOutput(input)  
→ ordered list of text + object blocks

parseJson(input)  
→ null | object | array of objects  

---

# How It Works (Architecture)

Raw LLM Output  
→ Preprocessor  
→ Soft Tokenizer (MAYBE tokens, scored)  
→ Soft Parser (backtracking, grammar hints)  
→ Read-Repair Reconstructor  
→ Strict JSON string  
→ JSON.parse()  
→ Beautiful clean object(s)

Repairs happen *during* reconstruction — not after.  
Context drives correctness.

---

# Test Philosophy

Every new LLM horror scenario becomes a test case.

Tests assert:
1) the segmented raw blocks  
2) the extracted JSON projection  

Examples include:
- missing commas  
- missing quotes  
- inline comments  
- YAML lists  
- apostrophes in text  
- back-to-back objects  
- emoji values  
- nested objects with bare keys  
- malformed indentation  
- fenced blocks  
- NPR-host narration  
- multi-tool-call streaming fragments  

The library improves by growing its trauma dataset.

---

# Current Status

22/29 tests passing.

Working:
- missing quotes  
- missing commas  
- inline comments  
- nested bare-key objects  
- emoji  
- unicode quotes  
- arrays  
- narration + object interleave  
- double/triple tool calls with derailments  

In progress:
- YAML lists with inconsistent indentation  
- YAML mixed with inline JSON  
- multiline values  
- some pathological missing-brace scenarios  

---

# Roadmap

- Better YAML-ish reconstruction  
- Streaming parser  
- Visualization/debug tools  
- WASM core  
- Python port (sloppy-parser-py)  
- Agent wrapper for OpenAI-compatible API  
- Schema hints for smarter repair scoring  

---

# Contributing

Bring your horrors.

We don’t want your code.  
We want your *nightmare test cases*.  

The worse the sample, the better the parser becomes.

PRs should include:
- the cursed input  
- expected segmented blocks  
- expected JSON projection  

---

# License  
MIT

---

# A Note on Philosophy

Strict parsers reject malformed input.  
Humans don’t speak in strict syntax.

This library assumes:
- the model tried  
- the structure is implied  
- the intent is clear  
- context can fix what syntax broke

sloppy-parser-js is built on the idea that  
**repair is more useful than rejection**.

Grace, not strictness.