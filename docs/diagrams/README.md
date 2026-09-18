# Editable project diagrams

Repository snapshot: 2026-09-19. These files describe the current local schema, Supabase migrations and application code; they are not live database introspection or evidence of hosted deployment.

- [DATABASE_ERD.drawio](DATABASE_ERD.drawio): three pages covering native/web persistence, private cloud sync/update policy, and collaboration/images/subscriptions.
- [APPLICATION_OVERVIEW.drawio](APPLICATION_OVERVIEW.drawio): local-first client, storage, sync coordination, Supabase, billing and native utilities.

Open in draw.io / diagrams.net. Solid crow’s-foot relations indicate declared FKs; purple dashed ERD relations are application-managed links. Managed Auth columns are partial references. Expense/checklist/reminder rows remain JSON inside a single note record rather than independent tables.

## Regenerate and validate

Run from the repository root with Node.js, Python and the project draw.io skill installed:

```powershell
node scripts/generate-project-diagrams.cjs
python .agents/skills/drawio-skill/scripts/validate.py docs/diagrams/DATABASE_ERD.drawio --strict --score
python .agents/skills/drawio-skill/scripts/validate.py docs/diagrams/APPLICATION_OVERVIEW.drawio --strict --score
```

Regeneration overwrites the generated diagrams, including manual geometry changes. The generator uses the bundled skill SQL parser; moving/removing that skill requires updating the dependency first. Update snapshot labels and review the output when schemas change. Structural validation is not visual rendering or semantic deployment verification. A local draw.io renderer is optional for exports and was unavailable during initial generation.

See [architecture](../ARCHITECTURE.md), [project state](../PROJECT_STATE.md) and the [documentation index](../README.md).
