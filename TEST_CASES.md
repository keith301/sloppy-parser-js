# sloppy-parser-js — Horror Gauntlet v1  
A lovingly-curated museum of malformed JSON/YAML abominations  
for your Soft Grammar Parser™ to suffer through.

---

## 🟥 1. JSON… But Written By a Drunk Ghost

### **Case 1 — Missing quotes, missing commas, missing hope**
```
{foo:bar baz:qux}
```

### **Case 2 — Object that ends early because the model got distracted**
```
{"a":1, "b":
Oops I forgot}
```

### **Case 3 — Two tool calls with mid-sentence derail**
```
Sure I'll do it
{tool: first}
and also
{tool: second params:{x: 1}}
```

### **Case 4 — Everything is there, just in the wrong order**
```
:a "value" key
```

---

## 🟧 2. YAML… Except It’s Not YAML, It’s Trauma

### **Case 5 — YAML list that forgot indentation exists**
```
items:
 - one
  - two
    - three
```

### **Case 6 — YAML with inline JSON sprinkles and bipolar formatting**
```
person:
  name: Keith
  details: {likes: coffee wtf: "yes" why: no clue
```

### **Case 7 — YAML key then derailing into JSON**
```
metadata:
  author: "Keith"
  notes: btw here's the json you asked for {foo: bar}
```

---

## 🟨 3. Fenced Blocks Gone Wrong

### **Case 8 — Starts ```json and forgets to end it**
```
```json
{foo:"bar"
and then I thought of this:
- nonsense
```

### **Case 9 — Ends the fence early**
```
```yaml
a: 1
b: 2
```
oops forgot this part: {c:3}
```

---

## 🟩 4. Random Narration Mid-Parse

### **Case 10 — NPR host energy**
```
I think this will work...
{foo:1}
Anyway let me tell you about
the time I broke JSON parsing
{bar:2 baz:3}
Okay I'm done now
```

### **Case 11 — mid-object editorializing**
```
{
  name: Keith  # obviously
  age: 42
  btw I love YAML
  role: CTO
}
```

---

## 🟦 5. Unicode & Emoji Crimes

### **Case 12 — curly quotes of doom**
```
{“tool”: “run”, “params”: {“x”: 1 “y”:2}}
```

### **Case 13 — emoji pretending to be a value**
```
{status: 👍}
```

### **Case 14 — cursed unicode whitespace**
```
{na​me: "haunted"}
```

---

## 🟪 6. Streaming Fragment Sewer Water

### **Case 15 — JSON broken across chunks**
```
{"user":{"id":1,"na
me":"Keith","ro
le":"CTO"}}
```

### **Case 16 — two objects, zero separators**
```
{"a":1}{"b":2}
```

### **Case 17 — unicode escape cut in half**
```
{"msg":"hi \uD83
d"}
```

---

## 🟫 7. Tool Calls With Creative Punctuation

### **Case 18 — function call hallucination**
```
{tool: run("stuff"), params:{a:1}}
```

### **Case 19 — semicolon JSON (sent from hell)**
```
{
  a:1;
  b:2;
}
```

### **Case 20 — model thinks it’s Python**
```
{
  "a":1,
  "b":2
  # comment
}
```

---

## 🟣 8. True “Why Am I Alive” Cases

### **Case 21 — inner object’s closing brace wanders off**
```
{
  "a": {
    "b": 1
  "c": 2
}
```

### **Case 22 — value suddenly becomes a story**
```
{
  "a": "hello",
  "b": I started typing a string and then remembered something
}
```

### **Case 23 — multiline string with no end**
```
{
  "a": "hello
  this keeps going
  and going
```

### **Case 24 — YAML and JSON had a child and it's unstable**
```
foo:
  bar:{a:1 b:2}
  baz:
  - x
 - y   # oh no
```

### **Case 25 — reverse JSON / fever dream**
```
b:2,
{
a:1
}
```

---
