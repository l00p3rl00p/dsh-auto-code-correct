# ACC 0.1.10 package comparison

This is an evidence branch. The original 0.1.10 TypeScript source was not included in its npm package.

Package inspection: 16 entries, 10 byte-identical, 6 changed. The 0.1.10 archive includes UI enhancements, Ruff no-cache flags, and a different manifest version. The existing 0.1.9 fixed build contains a session-persistence correction not present in 0.1.10. Retain both evidence sets until reconstructed source is verified.

## Complete file inventory

| File | Result |
|---|---|
| LICENSE | Identical |
| README.md | Changed: relative links versus canonical standalone links |
| cordis.patch.yml | Changed: Ruff no-cache options |
| lib/capabilities-DVURxqpt.d.ts | Identical |
| lib/cli.d.ts | Identical |
| lib/cli.js | Identical |
| lib/client.js | Changed: substantial AutoCorrect and readiness UI improvements |
| lib/hygiene-hook-BNoTX3P0.js | Identical |
| lib/index.d.ts | Identical |
| lib/index.js | Changed: session append mechanism |
| lib/typert.host.d.ts | Changed: generated numeric alias only |
| lib/typert.host.js | Identical |
| lib/typert.remote-client-CzXsERc3.js | Identical |
| lib/typert.remote-client.d.ts | Identical |
| lib/typert.remote-client.js | Identical |
| package.json | Changed: version and prepare script |

The original 0.1.10 package contains only compiled output, not the original TypeScript source. This branch documents its observed changes; it deliberately does not claim to reconstruct that source.
