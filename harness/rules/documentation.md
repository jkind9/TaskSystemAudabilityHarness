# ⚠️ CRITICAL RULE - FILE CREATION POLICY ⚠️

## README-ONLY Documentation Policy (STRICT)

**ALL documentation MUST live in README.md files. No loose .md files. No exceptions.**

- NO loose .md files anywhere (guides.md, notes.md, docs.md, setup.md, architecture.md, etc.)
- NO docs/ folders with scattered markdown files
- ONLY README.md files in project root and subdirectories
- README files MUST be **consistently maintained and updated** with every relevant change

**BEFORE creating ANY .md/.txt/.ipynb documentation file, you MUST:**
1. STOP and ask: "Should this be in an existing README.md instead?" (Answer is always YES)
2. If architectural learning: Update `~/.claude/learnings.md`
3. If neither applies: **DO NOT CREATE THE FILE**

**THIS RULE APPLIES TO:**
- Main conversation context
- All spawned agents (planner, architect, tdd-guide, code-reviewer, etc.)
- Plan mode
- All tools (Write, Edit, NotebookEdit, Bash)
- ALL contexts without exception

**CARVE-OUT — the task-tracking system is NOT documentation.** Per-task files under
`docs/tasks/{open,closed,pending_review,stale,archive}/` (or a repo's existing `task_list/`)
are engineering-traceability artifacts with receipts, governed by
[task-management.md](task-management.md). They are a deliberate, named exception to the
README-only policy: file them freely, do **not** ask "should this be in a README?". This is the
ONLY `docs/`-folder exception. Everything else in this rule still holds.

---

## File Creation Policy

### ABSOLUTELY FORBIDDEN
- **NO random .md files** scattered throughout the project (guides.md, notes.md, docs.md, setup.md, architecture.md, etc.)
- **NO adhoc documentation files** of any kind
- **NO duplicate documentation** across multiple files
- **NO documentation notebooks** (.ipynb for documentation purposes)

### ONLY ALLOWED
- **README.md files** - Update existing READMEs in project root or feature directories to capture:
  - Feature documentation
  - Process updates
  - Setup instructions
  - Usage examples
  - Component documentation

### MANDATORY FOR ARCHITECTURAL INSIGHTS
- **~/.claude/learnings.md** - Global learnings file for:
  - Framework patterns discovered
  - Architecture decisions
  - Key project structure insights
  - Process workflows
  - **NOT a bug log** - focus on high-level understanding
  - Update after significant architectural discoveries

## Documentation Workflow

1. **Before creating any .md/.txt file** - MANDATORY: Ask "Should this be in a README instead?"
2. **After learning something architectural** - Update `~/.claude/learnings.md`
3. **When documenting features** - Update relevant README.md (create if doesn't exist)
4. **Never** create standalone documentation files without explicit user request
5. **If user explicitly requests a documentation file** - Confirm they understand it violates the consolidation policy

## Examples

### WRONG
```
project/
  docs/
    api-guide.md
    setup-notes.md
    architecture.md
```

### CORRECT
```
project/
  README.md (contains setup, architecture overview)
  src/
    api/
      README.md (contains API documentation)
~/.claude/
  learnings.md (contains architectural insights)
```

## Learnings.md Structure

The `~/.claude/learnings.md` file should be organized by project and contain:

```markdown
# Project Learnings

## [Project Name]

### Architecture
- Key architectural patterns
- Technology stack decisions
- System design principles

### Frameworks & Libraries
- Framework-specific patterns
- Library usage patterns
- Integration approaches

### Processes
- Build and deployment workflows
- Testing strategies
- Development workflows

---

## [Another Project Name]
...
```
