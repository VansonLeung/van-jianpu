# Simple Jianpu rendering design

Implemented: a live SVG preview for transcription lines using the existing `parseNoteNotation` output. Text remains the source of truth; selection, keyboard shortcuts, context-menu commands, undo, and playback highlighting are shared with the existing editor. Previews open automatically for the selected line, with per-line show/hide controls. Individual lines and ordered project page sections can be exported as standalone SVG.

## Rendering choices

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| HTML/CSS note cells | Fastest small prototype; ordinary text selection | Precise placement and standalone export need extra work |
| **React SVG — recommended** | Explicit positioning, scalable preview/export, per-note click targets; no new dependency | Requires a small layout function for dots, underlines, and wrapping |
| Canvas/Konva | Reuses the image-workspace stack | Needs additional text accessibility, hit testing, and vector export work |

Use SVG for notation and keep Konva for image annotation. The renderer should be deterministic and entirely local, updating as notes are corrected.

## Map the existing notation

| Token | Proposed visual |
| --- | --- |
| `1`–`7`, `0` | Number or rest on the main baseline |
| `#4`, `b7`, `n4` | Sharp, flat, or natural glyph immediately before the digit |
| `1^`, `1^^` | One or two vertically spaced dots above the digit |
| `1_`, `1__` | One or two vertically spaced dots below the digit and any underlines |
| `1/`, `1//`, `1///` | One, two, or three horizontal strokes beneath the digit |
| `1` without `/` | No underline; removing subdivision removes only these strokes |
| `1.`, `1_./` | Rhythm dot at the right of the digit, independent of octave dots |
| `-` | Duration-extension dash |
| `|`, `||`, `|:`, `:|` | Single/double bars and repeat bars with repeat dots |
| `?` | Visible question mark with an unreadable-note highlight |

For example, `#4_// 5^/ 0 | ?` shows a sharp 4 with two underlines and a low-octave dot below them, a 5 with one upper dot and one underline, a rest, a bar, and an unknown note. The raw string remains available for editing and copying.

## Layout

1. Parse the current text into tokens, retaining each token's text offsets and index. Reuse the existing parser so the preview and structured editor accept exactly the same notation.
2. Measure the digit and accidental, reserve horizontal space for rhythm dots, and calculate the required top/bottom space for every token. Use separate vertical rows for upper dots, the main digit, underlines, and lower dots to avoid collisions.
3. Assign each token an advance width with consistent minimum spacing. Initially use compact, readable spacing rather than proportional beat spacing; the current text lacks a time signature and beat-group information.
4. Wrap at barlines where possible; wrap between tokens for a measure wider than the panel. Keep every note and its marks together. A preview zoom setting controls notation size independently of image zoom.
5. Render each token as an SVG group with a stable hit rectangle. Compute one layout for both the visible preview and eventual SVG export.

Start with separate underlines for each note. Shared underlines across groups require an explicit grouping rule or grouping metadata; the current `/` suffix records duration only. Do not infer beam groups from adjacent equal durations. A later grouping command could join selected adjacent notes without changing the text's duration meaning.

## Selection and editing

- Clicking a rendered note selects its existing token; Shift-click extends the range and Cmd/Ctrl-click toggles membership. Reuse existing selection state so text, note controls, and preview stay synchronized.
- Show selection behind the entire glyph group, including all dots and underlines. Use the current right-click actions and keyboard commands for pitch, octave, subdivision, and undo.
- Give the preview a focusable group with a readable description and preserve the plain-text field. Export only notation; selection backgrounds and editing controls are UI state.
- Invalid or incomplete input shows a local parse message while retaining all input. Avoid presenting the previous valid preview as if it represented the current text.
- Selecting a rendered note can focus its source **line crop**. Exact note-to-image highlighting needs individual note bounding boxes, which are not currently stored.

## Implementation and extensions

1. `services/rendering/jianpuLayout.ts` produces glyph positions and drawing primitives. Digits use an explicit 16-unit advance at a 26-unit font size, with reserved space for accidentals and dots; export and preview share these metrics. `components/notes/JianpuLinePreview.tsx` renders the interactive SVG and observes available width. Tests cover low dots with three underlines, high octaves, dotted rests, accidentals, repeats, unknowns, and narrow widths.
2. The result-card toggle, zoom controls, shared selection/context menus/undo, and playback marker are implemented. Collapsed previews avoid rendering every line at once. Zoom and explicit visibility choices are local to the mounted editor; notation and edits retain the existing project persistence.
3. `services/rendering/jianpuSvg.ts` writes standalone line and project SVGs from the same layout. Project exports use ordered, labeled page sections and consistent margins in a single SVG. Print/PDF pagination, explicit note grouping, and key/time headings remain separate extensions.

Corrected text can now be checked visually beside its source crop without another recognition request or a project format change.
