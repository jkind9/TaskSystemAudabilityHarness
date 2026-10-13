# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate:

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}
```

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components
- Organize by feature/domain, not by type

**The 800 line limit is enforced, not advisory** (`scripts/hooks/file-size-gate.js`, added
2026-09-10). A PreToolUse hook refuses any Write or Edit that would take a code file past 800
lines, and refuses any growth at all in a file already over it. Shrinking one is always
allowed. This exists because prose alone did not hold: one module in a live project grew from
686 to 5,475 lines in eight days while every other gate passed, because each gate checked
*which* file was written and none checked *how big* it became.

The escape is not a flag. A task deliberately splitting a long file lists that path under a
`shrinks:` key in its task file; the gate then lets it through and `task.js verify` requires
the file to be smaller at close than at the launch commit. A promise the tooling measures.
`node ~/.claude/task-system/task.js audit` lists every file over the limit and whether an open
task has promised to shrink it. `ECC_FILE_SIZE_LIMIT` overrides the number for one shell.

## Error Handling

ALWAYS handle errors comprehensively:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## Try/Except Rules (CRITICAL)

**NEVER use bare or overly broad exception handling that silently degrades functionality:**

```python
# WRONG: Silent fallback hides critical failures
try:
    result = important_operation()
except Exception:
    result = fallback()  # User never knows the real operation failed!

# WRONG: Catching ImportError and silently degrading
try:
    import required_package
    use_advanced_feature()
except ImportError:
    use_basic_feature()  # Silent degradation - user expects advanced!

# CORRECT: Catch specific exceptions, fail loudly for unexpected ones
try:
    result = parse_user_input(data)
except ValueError as e:
    raise ValidationError(f"Invalid input format: {e}")
# Let other exceptions propagate - they indicate real bugs

# CORRECT: If fallback is intentional, WARN the user explicitly
try:
    import optional_package
    use_optional_feature()
except ImportError:
    warnings.warn("optional_package not installed, feature disabled")
    # OR raise with clear message:
    raise ImportError("optional_package required for this feature. Install with: pip install optional_package")
```

**Rules:**
1. NEVER catch `Exception` or `BaseException` without re-raising
2. NEVER silently fall back to degraded functionality
3. ALWAYS catch the most specific exception type possible
4. ALWAYS log or warn when catching expected exceptions
5. If a dependency is required, let ImportError propagate with a clear message

## Input Validation

ALWAYS validate user input:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No console.log statements
- [ ] No hardcoded values
- [ ] No mutation (immutable patterns used)

## Human-readable code

Code should make its purpose clear at the call site to a capable reader who has not studied the rest of the repository.

- Name arguments and variables for the information they carry. Avoid generic names such as `state`, `context`, `result`, and `config` when a layer-specific name can say more.
- Pass each layer only the settings it uses. Prefer a small layer-specific configuration over a catch-all object passed through every call.
- Keep orchestration as a plain, ordered sequence of named inputs, layer calls, outputs, and validation. Avoid generic dispatch tables, callback wrappers, nested functions, and nested control flow when direct calls and guard clauses make the flow clearer.
- Keep each layer's runtime separate from its validation. Validate the layer's output contract next to the call. Keep independent reference scoring separate from method inputs.
- Explain shared objects and non-obvious arguments in short plain-English docstrings or inline comments. Say what the run context owns, which settings a layer reads, and what its validator checks. Do not narrate an obvious line.
- Before keeping or adding a class, identify the data and behavior it owns and its callers. Keep a class when it expresses a useful domain contract or lifecycle. Remove wrappers that only rename, forward, or collect values without making the code easier to follow. Reuse existing contracts when they fit.
