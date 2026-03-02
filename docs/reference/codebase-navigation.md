# Codebase Navigation Reference

How to find things, trace data flow, and coordinate subagents in this codebase.

## Canonical Data Flow

Almost every feature follows this path:

```
Screen (app/*.tsx)
  → Hook (hooks/use*.ts)
    → lib/supabase.ts (typed CRUD function or invokeWithRetry)
      → Supabase DB (direct query)
      — or —
      → Edge Function (supabase/functions/*/index.ts)
        → _shared/ utilities (auth, safety, genai)
        → Supabase DB (server-side)
```

When tracing a bug or understanding a feature, follow this path. Start at the screen, find which hook it calls, find which `lib/supabase.ts` function the hook calls, and (if applicable) which edge function it invokes.

## Search Tool Order

**Never start by reading all of `lib/supabase.ts` (~3,500 lines).** Use targeted searches:

1. **Glob** — Find files by name pattern (fast, use first)
2. **Grep** — Find content by regex (use after you know what to search for)
3. **Read** — Read specific file sections (use after Grep narrows the location)

### Finding Things Quickly

| Goal | Tool | Pattern |
|------|------|---------|
| Find a screen | Glob | `app/**/{feature-name}*.tsx` |
| Find a hook | Glob | `hooks/use{Feature}*.ts` |
| Find a supabase function | Grep | `export.*function.*{featureName}` in `lib/supabase.ts` |
| Find a type definition | Grep | `export.*interface\|type.*{TypeName}` in `lib/supabase.ts` |
| Find an edge function | Glob | `supabase/functions/{function-name}/index.ts` |
| Find where a function is called | Grep | `{functionName}(` across `app/`, `hooks/`, `lib/` |
| Find a component | Glob | `components/**/{ComponentName}*.tsx` |
| Find color tokens | Read | `constants/Colors.ts` |
| Find safe language rules | Read | `docs/reference/health-domain.md` |
| Find an edge function invocation | Grep | `invokeWithRetry.*{function-name}` in `lib/supabase.ts` |

## Subagent Prompt Template

When delegating to a subagent, give it a focused task with structured return expectations:

```
Task: {One sentence describing exactly what to find or do}

Search strategy:
1. {First search — Glob or Grep with specific pattern}
2. {Second search — Read the results from step 1}
3. {Third search — if needed, follow the data flow one level deeper}

Return: {Exactly what information to bring back}
- File path + line numbers
- The relevant code snippet
- Any related types or interfaces
```

### Example: "Find how meal check-ins are stored"

```
Task: Find the data flow for meal check-in storage (energy, fullness, cravings).

Search strategy:
1. Grep for "check.in" or "checkin" in app/ to find the screen
2. Read the screen to find which hook/function it calls
3. Grep for that function name in lib/supabase.ts
4. If it calls an edge function, read the edge function

Return:
- Screen file path
- Storage function in lib/supabase.ts (name + line number)
- Table name and column names
- Whether it goes through an edge function or direct DB
```

## Common Exploration Patterns

### "Does feature X exist?"

1. Glob for `app/**/*{feature}*` and `hooks/use*{Feature}*`
2. Grep for `{feature}` in `lib/supabase.ts` (function names)
3. If nothing: the feature doesn't exist yet

### "What does edge function Y do?"

1. Read `supabase/functions/{name}/index.ts`
2. Note which `_shared/` imports it uses
3. Grep for `invokeWithRetry.*{name}` in `lib/supabase.ts` to find the client-side caller
4. Read the client wrapper to see what params it sends and what type it expects back

### "What data does screen Z use?"

1. Read `app/{screen}.tsx`
2. List its hook imports (`useAuth`, `useDailyContext`, custom hooks)
3. Read each custom hook to see which `lib/supabase.ts` functions it calls
4. Those functions reveal the tables and queries

### "Where is this type used?"

1. Grep for the type name across `app/`, `hooks/`, `lib/`, `components/`
2. Focus on import statements to find consumers
3. Check `lib/supabase.ts` for the canonical definition

## Key Files to Know

| File | Lines | Role |
|------|-------|------|
| `lib/supabase.ts` | ~3,500 | ALL typed API helpers, types, CRUD. The data layer monolith. |
| `app/_layout.tsx` | ~200 | Root layout, providers, background, navigation config |
| `app/(tabs)/_layout.tsx` | ~150 | Tab bar configuration (NativeTabs) |
| `context/AuthContext.tsx` | ~300 | Auth state, profile, onboarding status |
| `constants/Colors.ts` | ~200 | All color tokens, gradients, category colors |
| `lib/insights.ts` | ~500 | Rules-based insight generation, safe language |
| `lib/experience.ts` | ~100 | Experience variant management |
