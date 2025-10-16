# Clip Drawer & Channel Interaction Checklist

- [x] ~~Center the “reload questions” control in the left panel question list for clearer affordance.~~
- [x] ~~Restyle the clip drawer header (Now playing + title/channel/date) for higher contrast and readability.~~
- [x] ~~Give the clip action buttons (`Open on YouTube`, `Download HQ`, `Generate high-quality clip`) distinct backgrounds/hover states.~~
- [x] ~~Rename “Generate HQ” to “Generate high-quality clip” and surface friendly toast feedback (success & failure).~~
- [x] ~~Clamp negative clip timestamps before queueing HQ clips to avoid backend validation errors.~~
- [x] ~~Sanitize clip excerpts in the drawer (remove `[X | …]` prefixes) and show a neutral placeholder when missing.~~
- [x] ~~Make the Source List channel label clickable (links to Twitter handles when prefixed with `@`).~~
- [x] ~~Update Playwright e2e coverage to exercise the new UX: channel link, generate button label, sanitized excerpt, and bundle flow.~~

Latest verification: `pnpm test:e2e`
