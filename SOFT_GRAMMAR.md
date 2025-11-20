# Soft Grammar Specification for sloppy-parser-js

## Core Philosophy

**We are NOT writing a strict grammar.**  
**We are writing a SOFT GRAMMAR where tokens and productions have multiple possible interpretations.**

The parser explores multiple fuzzy paths with backtracking, scores them, and picks the least-wrong repair.

---

## Fuzzy Productions

### Classic Grammar (what we're NOT doing):
```
KEY_VALUE := KEY SEPARATOR VALUE
KEY := QUOTE TEXT QUOTE
SEPARATOR := ":"
VALUE := STRING | NUMBER | OBJECT
```

### Soft Grammar (what we ARE doing):
```
KEY_VALUE := KEY? SEPARATOR? VALUE?

KEY := 
    QUOTED_KEY
  | BARE_KEY
  | MAYBE_KEY
  | KEY_UNTIL_PUNCTUATION
  | KEY_THAT_PROBABLY_SHOULD_HAVE_BEEN_QUOTED
  | ANYTHING_UNTIL_COLON

SEPARATOR :=
    ":"
  | " : "
  | whitespace ":" whitespace
  | missing_but_inferred
  | "=" (if model hallucinated CLI flags)

VALUE :=
    QUOTED_STRING
  | NUMBERISH
  | OBJECTISH
  | ARRAYISH
  | YAML_SCALAR
  | BAREWORD
  | TEXT_BLUFFING_AS_JSON
  | EMOJI (we hate this but it happens)
```

---

## Fuzzy Tokens (MAYBE tokens)

Tokens that represent "this could be X but maybe not":

```
MAYBE_QUOTE :=
    "\""                    // literal quote
  | ""                      // missing quote but would make sense
  | """ | """               // cursed unicode quotes
  | "'"                     // single quote pretending it's JSON

MAYBE_COLON :=
    ":"                     // actual colon
  | ""                      // missing but context suggests it should be here
  | whitespace              // space where colon should be

MAYBE_COMMA :=
    ","                     // actual comma
  | ""                      // missing but between values
  | whitespace + newline    // line break acting as separator
```

---

## Token Lattice

At any given point, the "next token" might match multiple things.

For example, reading `foo: bar`:

```
Position 0: "f"
  Could be: BARE_KEY_START | TEXT | MAYBE_FENCE_START
  
Position 3: ":"
  Could be: SEPARATOR | TEXT_COLON | YAML_KEY_MARKER
  
Position 5: "b"
  Could be: BARE_VALUE_START | TEXT | NEW_KEY
```

The parser creates a **lattice of possibilities** and explores multiple paths.

---

## Weighted Transitions

Each interpretation has a score:

- **QUOTED_KEY**: score +0 (ideal)
- **BARE_KEY**: score +2 (needs repair)
- **KEY_UNTIL_COLON**: score +3 (aggressive inference)
- **MISSING_QUOTE**: score +5 (major repair)

The parser backtracks and tries alternates, keeping track of cumulative scores.

---

## Best-Path Selection

After exploring multiple parses:

1. Filter to only valid completions (those that produce parseable JSON)
2. Sort by score (lowest = least repairs needed)
3. Return the winner

If all paths fail → return best partial parse + error info

---

## Example: Parsing `{foo: bar}`

### Path 1: Strict JSON (fails)
- Try parse as-is
- JSON.parse() throws
- Score: ∞ (invalid)

### Path 2: Repair bare key
- See `{` → start object
- See `foo` → BARE_KEY
- See `:` → SEPARATOR
- See `bar` → BARE_VALUE
- Repair: `{"foo": "bar"}`
- JSON.parse() succeeds
- Score: 4 (quoted key +2, quoted value +2)

### Path 3: YAML interpretation
- Parse as YAML
- Convert to JSON
- Score: 5 (YAML mode penalty)

**Winner: Path 2** (lowest score among valid parses)

---

## Implementation Strategy

1. **Tokenizer produces MAYBE tokens**
   - Each position may yield multiple token interpretations
   - Tokens carry probability/score hints

2. **Parser explores fuzzy productions**
   - Each production rule has multiple alternates
   - Backtracking when a path fails
   - Snapshot position before trying each alternate

3. **Repairer scores each path**
   - Track all repairs made
   - Sum scores for path ranking
   - Keep warnings for debugging

4. **Return best valid parse**
   - Multiple candidates may succeed
   - Choose lowest-score winner
   - Preserve repair metadata

---

## Non-Goals

This is NOT:
- A formal grammar
- LL(1), LR(k), or any strict parsing class
- A validator
- Trying to reject "invalid" input

This IS:
- A probabilistic constraint soup
- A permission system
- Optimistic repair
- Best-effort interpretation

---

## Mental Model

Think of it like autocorrect for structure:

- Typos are expected
- Multiple corrections possible
- Choose the most likely intended meaning
- Never fully reject (always try to extract something)

