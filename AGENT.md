# AGENT.md

## Project Context

Make PA is a local Next.js app for editing PA sheet PDFs in the browser. The main workflow is:

1. Upload a PA sheet PDF.
2. Render the original PDF as a visual template.
3. Add and edit overlay fields on top of the PDF.
4. Build a stage plot.
5. Export the visible result through `html2canvas` and `jsPDF`.

The current code is intentionally small. Keep changes focused and avoid introducing broad architecture until repeated behavior makes it necessary.

## Coding Rules

- Follow KISS, DRY, and YAGNI.
- Prefer the existing React/TypeScript patterns before adding new abstractions.
- Keep strongly related UI, state, and helper logic colocated. Promote code to shared modules only after it is reused.
- Preserve user changes. Do not revert unrelated diffs.
- Use strict TypeScript. Avoid `any` unless the upstream library shape makes it unavoidable.
- Add TSDoc to exported functions, shared helpers, and non-obvious PDF/canvas/state logic. Use `@param` and `@returns` when they clarify behavior.
- For new `.ts` / `.tsx` files, start with a short file responsibility comment.

## Next.js Rules

- This project uses Next.js 16.2.x. Before changing Next.js-specific APIs, read the relevant docs under `node_modules/next/dist/docs/`.
- Do not wrap an entire page in `<Suspense>`. Use focused Suspense boundaries only where needed.
- Keep client-only browser APIs such as PDF rendering, canvas work, file upload, and `localStorage` inside client components or browser-only effects.

## UI Rules

- Build this as a practical work tool, not a landing page.
- Prioritize dense, scannable layout for PDF preview, input table, stage plot, and export controls.
- Use the design tokens in `app/globals.css`; extend them deliberately instead of scattering one-off colors.
- Keep cards shallow. Do not nest cards inside cards.
- Use stable dimensions for tables, toolbars, icon buttons, PDF overlays, and stage items so interaction does not shift layout.
- Avoid emojis in UI. If icon buttons are added and an icon dependency is needed, prefer `lucide-react`.
- Check mobile and desktop layouts when touching UI.

## PDF And Stage Plot Rules

- Preserve the DOM-to-image export approach unless the task explicitly changes PDF generation.
- Keep overlay field coordinates as percentage-based positions relative to the rendered PDF page.
- Ensure edits in the input table and PDF overlay stay synchronized.
- Do not break sample PDFs under `samples/`.
- When stage plot behavior changes, verify both the editable board and exported preview behavior.

## Issues Workflow

- For issue work, read the GitHub issue requirements first and map the acceptance criteria before editing.
- Finish each issue with `npm run build`.
- For UI or PDF changes, also run the app and manually verify the relevant flow with a sample PDF.
- If a design or architecture decision is significant and likely to affect later issues, ask before adding an ADR under `docs/adr/`.
