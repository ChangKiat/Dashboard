> **DO NOT bulk re-copy.** During the 2026-10 sync the files here differed from `../../AI Agent/src/` in both directions.
> `AI Agent/src` is the source of truth: change shared code there first, then copy the file here. Never whole-file copy a file whose diff has lines on both sides.

# Vendored AI Agent modules

Copies of shared DB/schema/services from the sibling AI Agent project so Dashboard can deploy alone (e.g. Render).

When Agent services change, re-copy the files listed here from `../AI Agent/src/` into this folder.
