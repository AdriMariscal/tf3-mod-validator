@AGENTS.md

## Claude Code sessions in this repo

Sessions here are recorded with Trajector. A session is rewarded only if it meets the rules below,
so treat them as hard requirements.

- **Model:** `claude-opus-5-5` for the main conversation **and** every subagent.
  `.claude/settings.json` pins both. Never pass `model: "haiku"` or `"sonnet"` when spawning an
  agent, and prefer doing the work inline over spawning agents.
- **Reasoning:** the session's transcript view must be set to Thinking before the first message.
  If a session starts without visible reasoning, say so in your first reply so the author can
  restart it.
- **Every session changes at least one code or config file.** Markdown-only sessions are not
  rewarded.
- **Tool errors stay under 25 %** of tool calls. Check that a path or command exists before you
  run it, instead of trying and failing.
- **Verified results:** finish each task with `pnpm test` passing, and report its output.
