## Confirmed v4 scope (2026-09-12)

The decisions below supersede alternatives in the original planning notes retained below.

- Local fullscreen browser app: Vite, React, TypeScript, Ant Design, React-Konva, and a Node.js/Express backend.
- Independent `frontend` and `backend` packages, lockfiles, and `node_modules`. The backend also serves the Vite `frontend/dist` production build.
- Import multiple images as ordered project pages, with note lines nested beneath their corresponding image. View one page at a time; draw, select, move, resize, and delete note-line rectangles. Reorder pages and lines with drag handles or arrows; lines stay within their source page. Store coordinates in original image pixels; support zoom and pan.
- Resize the right transcription panel with a draggable, keyboard-accessible divider; remember its width locally. Stack results below the image on narrow screens.
- Prioritize the exact `0–7` digit sequence. Capture octave dots, accidentals, and barlines where readable; rhythm is secondary. Ignore lyrics and Chinese dynamics.
- Unreadable notes use the standalone token `?`. Octaves use `^` / `_`; per-note underlines use `/`, `//`, `///`; right-side rhythm dots use `.`.
- The existing `.env` supplies OpenAI-compatible backend defaults. Endpoint/model can be saved in app settings; an entered API key stays in memory. Do not expose the backend key.
- Per-line scanning/retry/cancellation and side-by-side crop/text verification. Preserve manual edits across rescans; crop changes invalidate old recognition.
- Note editing: whole-note and range selection, toolbar/right-click/keyboard actions, pitch and attribute editing, insertion/duplication/deletion, and per-line session undo/redo. Keep the native plain-text editor available.
- Subdivisions are exact assignments: `R` then `1–4` sets 0–3 underlines. No underline removes only the subdivision suffix. Show the current value or Mixed for group selections; keep rhythm dots independent.
- Right-click preserves an existing selected group or selects the clicked unselected note. Offer the same menu via a ⋯ button and Shift+F10; disable actions that do not apply to the selected symbols.
- Persist all pages, the active page, rectangles, order, and corrected/model text in IndexedDB. Support TXT in page/line order and version 2 editable JSON project export/import; migrate version 1 single-image projects. Page switching preserves per-line session undo and routes pending scan results to their original page.
- Simple Jianpu rendering: interactive SVG previews from the existing tokens, with independent zoom, bar-aware wrapping, shared editing selection/context menus/shortcuts, and playback highlighting. Export individual lines or the ordered project's page sections as standalone SVG. Keep per-note underlines separate; shared grouping and print/PDF pagination are deferred. See [JIANPU_RENDERING_PROPOSAL.md](JIANPU_RENDERING_PROPOSAL.md).
- Erhu playback uses the supplied `frontend/assets/FS_Erhu_v2.sf2` through SpessaSynth/Web Audio. Defaults: `1=C4`, 90 quarter notes/minute, standalone per-note accidentals, `?` as an estimated silent quarter, and repeats off. Save key/register/tempo/volume/repeat settings in the project; retain compatibility with existing project files.
- Play a line, page, project, or from a selected note; loop contiguous selections. Provide pause/resume/stop, independent playback highlighting, optional page following, and opt-in audition of single-note corrections. Musical edits or reordering stop playback; volume adjusts live. Honor repeats supports matched, nonnested simple repeats twice; line/page breaks add no time.
- Use `analysis_outputs/552c8d531cf8f_row_03.png` as the initial real-world diagnostic. It contains compact digit groups, low-octave dots, underlines, bars, and Chinese dynamics. Broader accuracy claims need additional labeled samples.
- PDF/MIDI/MusicXML file import/export, automatic rectangle detection, and Electron are deferred. Playback's internal MIDI sequence is not a file import/export feature.

Implementation and run instructions: [README.md](README.md).

---

## Original planning notes

make me a plan of an app to scan JIANPU / SIMPLE NOTATION SHEET:

- support import photo / upload image
- support annotating / drawing rectangles on top of the image
- given a user shall draw rectangles over the notes line areas (i.e. he draws rectangles to indicate each note line in the sheet paper)
- LLM to analyze and convert the note lines to JIANPU notation texts







An interactive image-to-Jianpu digital scanner uses a client-side annotation canvas combined with a backend Vision-LLM processing pipeline.

**System Architecture & Stack**

* **Frontend Canvas:** Web (React + `Konva.js` / `Fabric.js`) or Mobile (React Native + `react-native-skia`) to render high-res images and handle interactive rectangle overlays with pinch/zoom scaling.
* **Image Processing Engine:** Lightweight client-side canvas utility or backend Python script (`PIL` / `OpenCV`) that crops the full score into ordered sub-images using bounding box coordinates $(x, y, w, h)$.
* **Vision-LLM Orchestrator:** Backend API (FastAPI or Node.js) that feeds cropped line slices in parallel to a multimodal LLM (GPT-4o, Claude 3.5 Sonnet, or Gemini 1.5 Pro) with a structured system prompt.

**User Workflow**

1. **Import:** Capture a photo via camera or upload a clear PNG/JPEG of a Jianpu sheet.
2. **Annotate:** Drag rectangle bounding boxes over each note line system in reading order (Line 1, Line 2, etc.).
3. **Slice & Process:** Trigger processing; the app extracts image slices corresponding to each user rectangle.
4. **LLM Parsing:** Vision-LLM parses each image slice into structured ASCII/Unicode Jianpu text.
5. **Verify & Edit:** Side-by-side view (Cropped Image vs. Editable Text Field) for user verification and manual fixes before exporting.

**Jianpu Text Markup Format**
Specify a plain-text schema in the system prompt so the LLM outputs clean, predictable notation:

| Musical Element | Sheet Visual | Text Markup Output |
| --- | --- | --- |
| **Base Pitches** | Numbers `1` to `7`, Rest `0` | `1 2 3 4 5 6 7 0` |
| **High Octave** | Dot above note ($\dot{1}$) | `1^` or `1'` |
| **Low Octave** | Dot below note ($\dotsi{1}$) | `1_` or `1.` |
| **Sustain / Measure** | Dashes (`1 - - -`) | `1 - - -` (Whole note) |
| **Underlines (Subdivision)** | Single line (8th), Double line (16th) | `(1 2)` = 8ths, `((1 2))` = 16ths |
| **Sharp** | Sharp note | `#4` |
| **Flat** | Flat note | `b4` |
| **Structure** | Measure bar lines, Time Signature | ` |

**LLM Prompting Strategy**

* **Role:** Expert Optical Music Recognition (OMR) system for Jianpu (Numbered Musical Notation).
* **Instruction:** "Examine the attached image of a single line of Jianpu notation. Transcribe the notes, octave dots, rhythm dashes, underlines, and barlines sequentially from left to right using the defined markup schema. Output only raw plaintext without explanation."
* **Few-Shot Prompting:** Include 2–3 sample cropped line images paired with their exact output strings in the context prompt to significantly boost accuracy.

**Phase 1 Roadmap**

1. Build the UI canvas allowing users to draw, resize, reorder, and delete line bounding boxes over an image.
2. Create the backend endpoint to handle bounding box coordinates and crop image buffers.
3. Test 10–15 diverse Jianpu score crops against different multimodal models to evaluate transcription accuracy for octave dots and underlines.
4. Add the live side-by-side editor and a basic export feature (e.g., TXT, PDF, or MIDI conversion).













I wish it to use:

nodejs
vite
react
typescript
ant design

for the frontend interface








This updated frontend architecture integrates **Vite + React + TypeScript** with **Ant Design (antd)** for UI layout and **React-Konva** for interactive canvas annotation.

**Frontend Core Stack**

* **Build Tooling:** Vite (`react-ts` template) + Node.js
* **UI Component Library:** `antd` & `@ant-design/icons`
* **Canvas Layer:** `react-konva` & `konva` for performant canvas manipulation, shape dragging, and box resizing with full TypeScript support.
* **State Management:** Zustand (or React Context) to manage image scaling, rectangle coordinates, and parsed LLM results across components.

**TypeScript Data Models**

```typescript
export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lineOrder: number;
}

export interface JianpuLineResult {
  id: string;
  box: BoundingBox;
  croppedDataUrl: string;
  parsedText: string;
  status: 'idle' | 'scanning' | 'success' | 'error';
}

```

**Component Architecture**

| Component | Ant Design Elements | Core Responsibility |
| --- | --- | --- |
| **`ImageUploader`** | `<Upload.Dragger>`, `<Button>` | File drop zone; loads selected sheet photo into state and triggers canvas initialization. |
| **`AnnotationWorkspace`** | `<Card>`, `<Toolbar>` | Hosts React-Konva `<Stage>`. Listens to drag events to draw rectangles and attaches Konva `<Transformer/>` to adjust handles. |
| **`LineSidebar`** | `<List>`, `<Tag>`, `<Button>` | Displays bounding box overlays in numerical order (Line 1, Line 2, etc.). Allows reordering, deletion, and triggering batch LLM scanning. |
| **`ResultsEditor`** | `<Row>`, `<Col>`, `<Input.TextArea>` | Side-by-side verification view rendering cropped image slices alongside editable TextAreas for manual notation adjustments. |

**Canvas Annotation Workflow (React-Konva)**

1. Render the main sheet photo inside a Konva `<Image/>` component within `<Stage>`.
2. Allow users to click and drag to generate Konva `<Rect/>` components over each music line.
3. Crop image slices directly on the client using an off-screen HTML5 `<canvas>` via `canvas.getContext('2d').getImageData()` using normalized $(x, y, w, h)$ values.
4. Send the array of cropped Base64 strings to the backend endpoint for Vision-LLM parsing.












Designed for fullscreen app (and may support Electron.js in the future, but not now)

Promotional text and headers are discouraged





Code structure:

- Separation of concerns
- Separate files into (sub-)folders
- more verbose filenames and function names
- encourage smaller code line count









So the feature principle is:

- use LLM to analyze each given slice of image
- fetch the numbers of the notes correctly is the most important






Ready-to-use LLM is inside .env (it should be configurable in app as well)
