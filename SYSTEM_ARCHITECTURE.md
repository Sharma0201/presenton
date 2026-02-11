# Presentation Agent - System Architecture Documentation

> **Last Updated**: February 2026
> **Purpose**: Complete reference for understanding the hybrid Next.js + FastAPI architecture

---

## Table of Contents

1. [Tech Stack Overview](#tech-stack-overview)
2. [Architecture Explanation](#architecture-explanation)
3. [Nginx: The Orchestration Layer](#nginx-the-orchestration-layer)
4. [Complete PPTX Export Flow](#complete-pptx-export-flow)
5. [System Flow Diagrams](#system-flow-diagrams)
6. [Key Components](#key-components)
7. [File Structure Reference](#file-structure-reference)

---

## Tech Stack Overview

### Frontend Stack (Next.js Application)

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 14 | React framework with App Router (not Pages Router) |
| **React** | 18 | UI library with TypeScript |
| **Redux Toolkit** | Latest | State management (presentation data, user config) |
| **TailwindCSS** | Latest | Utility-first CSS framework |
| **Radix UI** | Latest | Headless UI components (via shadcn/ui) |
| **Tiptap** | Latest | Rich text editor for slide content |
| **Recharts** | Latest | Data visualization components |
| **html2canvas** | Latest | Screenshot/image generation |
| **Puppeteer** | Latest | Headless Chrome for PPTX export |
| **Sharp** | Latest | Image processing (SVG to PNG conversion) |

**Location**: `servers/nextjs/`

---

### Backend Stack (Python FastAPI)

| Technology | Version | Purpose |
|-----------|---------|---------|
| **FastAPI** | Latest | Modern async Python web framework |
| **SQLModel** | Latest | ORM combining SQLAlchemy + Pydantic |
| **SQLAlchemy (async)** | Latest | Async database ORM |
| **aiosqlite** | Latest | Async SQLite driver (default DB) |
| **Uvicorn** | Latest | ASGI server |
| **python-pptx** | Latest | PowerPoint file generation |
| **Docling** | Latest | Advanced document parsing (PDF, DOCX, PPTX) |
| **ChromaDB** | Latest | Vector database for document embeddings |
| **Pydantic** | Latest | Data validation and serialization |

**Location**: `servers/fastapi/`

---

### AI/LLM Integration

| Provider | SDK | Models Supported |
|----------|-----|------------------|
| **OpenAI** | openai | GPT-4, GPT-4o, GPT-3.5, DALL-E 3 |
| **Anthropic** | anthropic | Claude 3.5 Sonnet, Claude 3 Opus |
| **Google** | google-genai | Gemini 1.5 Pro, Gemini 1.5 Flash |
| **Ollama** | HTTP | Llama 3, Mistral, Qwen (local) |
| **Custom** | HTTP | OpenAI-compatible APIs |

**Abstraction Layer**: `servers/fastapi/services/llm_client.py`

---

### Infrastructure & Services

| Service | Purpose | Port |
|---------|---------|------|
| **Nginx** | Reverse proxy, static file server | 80 (→5000) |
| **Docker** | Containerization | - |
| **Minio** | S3-compatible object storage | 9000, 9001 |
| **Ollama** | Local LLM server | 11434 |
| **LibreOffice** | Document conversion (headless) | - |
| **Chromium** | Puppeteer browser engine | - |

---

## Architecture Explanation

### Why Next.js + Python Hybrid Architecture?

This application uses a **dual-backend architecture** where both Next.js and FastAPI have backend components:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Docker Container                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Nginx (Port 80)                          │ │
│  │              Single Entry Point - Reverse Proxy             │ │
│  └───────┬────────────────┬────────────────┬──────────────────┘ │
│          │                │                │                     │
│          ↓                ↓                ↓                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐           │
│  │   Next.js    │  │   FastAPI    │  │ MCP Server  │           │
│  │  Port 3000   │  │  Port 8000   │  │  Port 8001  │           │
│  │              │  │              │  │             │           │
│  │ • SSR/CSR    │  │ • LLM Calls  │  │ • FastMCP   │           │
│  │ • React UI   │  │ • PPTX Gen   │  │ • Tool API  │           │
│  │ • API Routes │  │ • Database   │  │             │           │
│  │ • Puppeteer  │  │ • Documents  │  │             │           │
│  └──────────────┘  └──────────────┘  └─────────────┘           │
│          │                │                                      │
│          ↓                ↓                                      │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │  Chromium    │  │   Ollama     │                            │
│  │ (Puppeteer)  │  │ Port 11434   │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         /app_data/ (Volume mounted to host)                 │ │
│  │  ├─ images/    (uploaded/generated images)                 │ │
│  │  ├─ exports/   (PPTX/PDF files)                            │ │
│  │  ├─ uploads/   (user uploaded documents)                   │ │
│  │  └─ fonts/     (custom fonts)                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Both Have Backend Components

#### Next.js Backend (API Routes in `app/api/`)

**Location**: `servers/nextjs/app/api/`

| Route | Purpose |
|-------|---------|
| `/api/can-change-keys` | Check if user can modify API keys |
| `/api/user-config` | Retrieve user configuration |
| `/api/presentation_to_pptx_model` | Convert HTML slides to PPTX model (Puppeteer) |
| `/api/export-as-pdf` | PDF export using Puppeteer |
| `/api/upload-image` | Image upload handler |
| `/api/save-layout` | Save custom template layout |

**Why these in Next.js?**
- Access to Node.js libraries (Puppeteer for PDF/PPTX conversion)
- Frontend-specific operations (reading userConfig.json)
- Server-side rendering utilities

#### FastAPI Backend (Primary API)

**Location**: `servers/fastapi/api/v1/`

| Endpoint Prefix | Purpose |
|----------------|---------|
| `/api/v1/ppt/presentation/*` | Presentation generation, CRUD, export |
| `/api/v1/ppt/outlines/*` | AI outline generation |
| `/api/v1/ppt/slide/*` | Slide CRUD operations |
| `/api/v1/ppt/images/*` | Image upload/generation (DALL-E, Gemini) |
| `/api/v1/ppt/files/*` | Document upload and parsing |
| `/api/v1/ppt/template-management/*` | Custom template storage |

**This is the core backend** - all AI operations, database access, and PPTX generation.

### The Split: Why Both?

| Aspect | Next.js | Python FastAPI |
|--------|---------|----------------|
| **Best for** | UI rendering, SSR, Node.js tools | AI/ML, document processing, complex logic |
| **Libraries** | Puppeteer, Sharp, frontend tools | OpenAI SDK, python-pptx, Docling, ChromaDB |
| **Type system** | TypeScript | Python type hints (Pydantic) |
| **Performance** | Fast V8 engine | Fast async Python |
| **Expertise** | Frontend developers | Backend/ML developers |

**Benefits:**
1. **Best tools for each job** - Python excels at AI/ML, Node.js at Puppeteer
2. **Independent scaling** - Scale AI workers separately from UI servers
3. **Clear separation** - Presentation layer vs. business logic
4. **Type safety** - TypeScript frontend + Python type hints backend

**Trade-offs:**
1. **Complexity** - Two runtimes (Node.js + Python)
2. **Type duplication** - API types maintained in both TS and Python
3. **Deployment** - Need both services running (Docker simplifies this)

---

## Nginx: The Orchestration Layer

### Overview: The Traffic Controller

Nginx acts as the **single point of entry** for the entire application. Every request from the browser goes through Nginx first, which intelligently routes it to the appropriate backend service.

**Why Nginx?**
- ✅ **Single port** (80 → 5000) exposed to outside world
- ✅ **Optimal performance** - Each service does what it's best at
- ✅ **Security** - Internal services (3000, 8000, 8001) hidden
- ✅ **Static file serving** - 10-100x faster than Node.js/Python
- ✅ **Load balancing** - Can add multiple instances later
- ✅ **SSL termination** - Add HTTPS without changing apps

### Configuration Breakdown

**File**: `nginx.conf`

#### Global Settings

```nginx
worker_processes auto;           # Auto-detect CPU cores
events {
  worker_connections 1024;       # 1024 concurrent connections per worker
}
http {
  client_max_body_size 100M;     # Allow 100MB file uploads
}
```

**Capacity**: On 4-core machine = 4 × 1024 = **4096 concurrent connections**

#### Routing Rules

##### 1. Next.js Handles All UI Requests (Default)

```nginx
location / {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;       # WebSocket support
  proxy_set_header Connection "upgrade";        # For Next.js HMR
  proxy_set_header Host $host;
  proxy_read_timeout 30m;                       # 30-minute timeout
  proxy_connect_timeout 30m;
}
```

**Matches:**
- `/dashboard`
- `/upload`
- `/presentation?id=123`
- `/settings`
- Any route not matched by other rules

**Why 30-minute timeout?** AI presentation generation can take several minutes per slide.

##### 2. FastAPI Handles All Backend API Requests

```nginx
location /api/v1/ {
  proxy_pass http://localhost:8000;
  proxy_read_timeout 30m;
  proxy_connect_timeout 30m;
}
```

**Matches:**
- `/api/v1/ppt/presentation/generate`
- `/api/v1/ppt/images/upload`
- `/api/v1/ppt/presentation/export/pptx`

##### 3. MCP Server (Model Context Protocol)

```nginx
location /mcp/ {
  proxy_pass http://localhost:8001/mcp/;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**Purpose:** Exposes FastAPI endpoints as tools for AI assistants (Claude Code).

##### 4. FastAPI Documentation

```nginx
location /docs {
  proxy_pass http://localhost:8000/docs;
}
```

**Access:** Visit `http://localhost:5000/docs` for interactive API docs.

##### 5. Static File Serving (Nginx's Superpower)

```nginx
location /app_data/images/ {
  alias /app_data/images/;
  expires 1y;
  add_header Cache-Control "public, immutable";
}

location /app_data/exports/ {
  alias /app_data/exports/;
  expires 1y;
  add_header Cache-Control "public, immutable";
}

location /app_data/uploads/ {
  alias /app_data/uploads/;
  expires 1y;
  add_header Cache-Control "public, immutable";
}

location /app_data/fonts/ {
  alias /app_data/fonts/;
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

**Why this matters:**

1. **Performance**: Nginx serves static files **10-100x faster** than Node.js or Python
   - Written in C, optimized for I/O
   - Zero application logic overhead

2. **Resource efficiency**:
   - Frees Next.js/FastAPI to handle business logic
   - No files loaded into application memory

3. **CDN-like caching**:
   - 1-year cache = downloaded once per file
   - `immutable` = browser never revalidates

4. **Direct disk access**:
   - No streaming through application code
   - Nginx reads from disk → sends to client

**Example flow:**
```
User: GET /app_data/exports/my-presentation.pptx
  ↓
Nginx: Matches /app_data/exports/
  ↓
Nginx: Reads /app_data/exports/my-presentation.pptx from disk
  ↓
Nginx: Streams directly to browser (0.5ms response time)
  ↓
Browser: Downloads PPTX
```

### Startup Sequence

```
1. Docker container starts
         ↓
2. CMD ["node", "/app/start.js"] executes
         ↓
3. start.js spawns processes in parallel:
   ├─ FastAPI (port 8000)      - Python server.py
   ├─ Next.js (port 3000)      - npm run start
   ├─ MCP Server (port 8001)   - Python mcp_server.py
   ├─ Ollama (port 11434)      - ollama serve
   └─ Nginx (port 80)          - service nginx start
         ↓
4. Nginx reads /etc/nginx/nginx.conf
         ↓
5. Nginx starts listening on port 80
         ↓
6. Docker port mapping: Host 5000 → Container 80
         ↓
7. User accesses http://localhost:5000
         ↓
8. Nginx routes request based on URL path
```

### Real Request Examples

#### Example 1: User Opens Dashboard

```
Browser: GET http://localhost:5000/dashboard
         ↓
Docker: Port 5000 → Container Port 80
         ↓
Nginx: Matches location / { proxy_pass http://localhost:3000; }
         ↓
Next.js (3000): Server-side renders /dashboard page
         ↓
Next.js: Returns HTML with embedded data
         ↓
Nginx: Forwards response to browser
         ↓
Browser: Renders dashboard with React hydration
```

#### Example 2: User Generates Presentation

```
Browser: POST http://localhost:5000/api/v1/ppt/presentation/generate
         ↓
Nginx: Matches location /api/v1/ { proxy_pass http://localhost:8000; }
         ↓
FastAPI (8000): Receives request
         ↓
FastAPI: Validates with Pydantic models
         ↓
FastAPI: Calls LLM (OpenAI/Anthropic/Gemini/Ollama)
         ↓
FastAPI: Generates outline → content → images
         ↓
FastAPI: Saves to SQLite database (presentation + slides tables)
         ↓
FastAPI: Returns { "id": "uuid", "title": "..." }
         ↓
Nginx: Forwards response
         ↓
Browser: Navigates to /presentation?id=uuid
```

#### Example 3: User Exports PPTX (Full Flow)

```
Browser: POST /api/v1/ppt/presentation/export/pptx
         ↓
Nginx: Routes to FastAPI (8000)
         ↓
FastAPI: Calls python-pptx library
         ↓
FastAPI: Creates /app_data/exports/my-pres.pptx
         ↓
FastAPI: Returns path: "/app_data/exports/my-pres.pptx"
         ↓
Browser: GET /app_data/exports/my-pres.pptx
         ↓
Nginx: Matches location /app_data/exports/
         ↓
Nginx: Reads file from disk (no app involvement)
         ↓
Nginx: Streams to browser (blazing fast)
         ↓
Browser: Downloads PPTX file
```

### Performance Impact

| Scenario | With Nginx | Without Nginx (Node.js) |
|----------|-----------|------------------------|
| **Static file serving** | ~0.5ms | ~10-50ms |
| **Concurrent requests** | 4096 (4-core) | ~100 |
| **Memory usage** | Minimal | High (files in memory) |
| **CPU usage** | Low | Medium-High |

**Real impact:** Nginx can serve thousands of images simultaneously while Next.js handles API logic.

---

## Complete PPTX Export Flow

This section details the **most complex operation** in the system - converting HTML slides to PowerPoint files.

### Architecture Decision: Why This Approach?

**Goal**: Export PowerPoint files that look **identical** to the web preview.

**Challenge**: PowerPoint uses Office Open XML format, not HTML/CSS.

**Solution**:
1. Use **Puppeteer** (Next.js) to render HTML and extract DOM properties
2. Convert DOM properties to **PPTX model** (TypeScript types)
3. Use **python-pptx** (FastAPI) to generate PowerPoint file

**Why hybrid?**
- **Puppeteer** has better Node.js support than Python alternatives
- Can render actual React components exactly as user sees them
- **python-pptx** is the most mature PowerPoint generation library
- Python has better image processing libraries (Pillow)

### Step-by-Step Flow

#### Step 1: User Clicks "Export as PPTX"

**File**: `servers/nextjs/app/(presentation-generator)/presentation/components/Header.tsx:67-99`

```typescript
const handleExportPptx = async () => {
  // 1. Save current presentation state to database
  await PresentationGenerationApi.updatePresentationContent(presentationData);

  // 2. Get PPTX model from Next.js API route
  const pptx_model = await get_presentation_pptx_model(presentation_id);

  // 3. Export to PPTX via FastAPI
  const pptx_path = await PresentationGenerationApi.exportAsPPTX(pptx_model);

  // 4. Download file
  downloadLink(pptx_path);
}
```

#### Step 2: Convert HTML Slides to PPTX Model (Next.js Backend)

**File**: `servers/nextjs/app/api/presentation_to_pptx_model/route.ts`

This Next.js API route uses **Puppeteer** to convert HTML → PPTX data model.

##### 2A. Launch Headless Browser

```typescript
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,  // /usr/bin/chromium
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
page.setViewport({ width: 1280, height: 720 });  // PowerPoint dimensions
await page.goto(`http://localhost/pdf-maker?id=${id}`);
```

**What happens:**
- Launches Chromium browser in headless mode
- Sets viewport to PowerPoint slide size (1280×720)
- Navigates to `/pdf-maker?id={id}` route which renders all slides
- Waits for `networkidle0` (all assets loaded)

##### 2B. Extract DOM Elements from Each Slide

For each slide, Puppeteer recursively traverses the DOM tree:

```typescript
const slides = await page.$$("#presentation-slides-wrapper > div > div");

for (const slide of slides) {
  const elements = await getAllChildElementsAttributes(slide);
  slideAttributes.push(elements);
}
```

**What gets extracted:**

1. **Position**: `getBoundingClientRect()` → `{ left, top, width, height }`
2. **Font**:
   - Family: `getComputedStyle(el).fontFamily`
   - Size: `parseFloat(fontSize)` (converted to points)
   - Weight: `parseInt(fontWeight)` (700+ = bold)
   - Color: `rgba() → hex` conversion
   - Style: `fontStyle === 'italic'`

3. **Colors**:
   - Background: `backgroundColor` → hex with opacity
   - Border: `borderColor` + `borderWidth`
   - Shadow: `boxShadow` parsed into offset/blur/color

4. **Layout**:
   - Margin: `{ top, bottom, left, right }`
   - Padding: `{ top, bottom, left, right }`
   - Border radius: `[topLeft, topRight, bottomRight, bottomLeft]`
   - Z-index: For element layering

5. **Text**:
   - `innerText` for plain text
   - `innerHTML` for formatted text (`<strong>`, `<em>`, etc.)
   - Text alignment: `textAlign`
   - Line height: Calculated from `lineHeight` and `fontSize`

6. **Images**:
   - `<img>` elements: Extract `src` attribute
   - Background images: Parse `background-image: url(...)`
   - Object fit: `contain` / `cover` / `fill`

7. **Special Elements**:
   - **SVG**: Screenshot and convert to PNG using Sharp
   - **Canvas**: Screenshot entire canvas as image
   - **Tables**: Screenshot the table as image

**Inline HTML formatting:**

Supports these tags with preserved formatting:
- `<strong>` → Bold text run
- `<em>` → Italic text run
- `<u>` → Underlined text run
- `<code>` → Monospace font
- `<s>` → Strikethrough

Example:
```html
<p>This is <strong>bold</strong> and <em>italic</em></p>
```

Becomes:
```typescript
{
  text_runs: [
    { text: "This is ", font: { size: 16, color: "000000" } },
    { text: "bold", font: { size: 16, color: "000000", weight: 700 } },
    { text: " and ", font: { size: 16, color: "000000" } },
    { text: "italic", font: { size: 16, color: "000000", italic: true } }
  ]
}
```

##### 2C. Convert to PPTX Models

**File**: `servers/nextjs/utils/pptx_models_utils.ts`

Converts extracted DOM attributes to TypeScript PPTX models:

```typescript
function convertElementToPptxShape(element: ElementAttributes) {
  // Determine shape type based on element properties
  if (element.imageSrc) {
    return convertToPictureBox(element);      // → PptxPictureBoxModel
  }

  if (element.innerText && element.background?.color && element.borderRadius) {
    return convertToAutoShapeBox(element);    // → PptxAutoShapeBoxModel
  }

  if (element.innerText) {
    return convertToTextBox(element);         // → PptxTextBoxModel
  }

  if (element.tagName === 'hr') {
    return convertToConnector(element);       // → PptxConnectorModel
  }
}
```

**Key conversions:**

| DOM Property | PPTX Model Property |
|-------------|---------------------|
| `px` values | → Points (Pt) |
| `rgb()/rgba()` | → Hex color |
| `text-align: center` | → `PptxAlignment.CENTER` |
| `lineHeight: 24px` | → Relative multiplier (1.5) |
| Web fonts | → PowerPoint-compatible fonts |

##### 2D. Return PptxPresentationModel

**Response JSON:**

```typescript
{
  slides: [
    {
      background: { color: "ffffff", opacity: 1.0 },
      shapes: [
        {
          shape_type: "text_box",
          position: { left: 50, top: 100, width: 500, height: 100 },
          margin: { top: 10, bottom: 10, left: 10, right: 10 },
          text_wrap: true,
          paragraphs: [
            {
              alignment: 2,  // CENTER
              text_runs: [
                {
                  text: "Hello World",
                  font: {
                    name: "Arial",
                    size: 24,
                    color: "000000",
                    weight: 700,
                    italic: false
                  }
                }
              ]
            }
          ]
        },
        {
          shape_type: "picture_box",
          position: { left: 200, top: 300, width: 400, height: 300 },
          clip: false,
          opacity: 1.0,
          border_radius: [10, 10, 10, 10],
          shape: "rectangle",
          object_fit: { fit: "cover", focus: [0.5, 0.5] },
          picture: {
            path: "/app_data/images/abc123.jpg",
            is_network: false
          }
        }
      ],
      note: "Speaker notes for this slide"
    }
  ]
}
```

#### Step 3: Send PPTX Model to FastAPI

**File**: `servers/nextjs/app/(presentation-generator)/services/api/presentation-generation.ts:227-243`

```typescript
static async exportAsPPTX(presentationData: PptxPresentationModel) {
  const response = await fetch(`/api/v1/ppt/presentation/export/pptx`, {
    method: "POST",
    headers: getHeader(),
    body: JSON.stringify(presentationData),
  });
  return await response.json();  // Returns file path
}
```

Request goes through:
1. Next.js fetch → 2. Nginx → 3. FastAPI (port 8000)

#### Step 4: Create PowerPoint File (Python Backend)

**File**: `servers/fastapi/api/v1/ppt/endpoints/presentation.py`

```python
@PRESENTATION_ROUTER.post("/export/pptx", response_model=str)
async def export_presentation_as_pptx(pptx_model: PptxPresentationModel):
    temp_dir = TEMP_FILE_SERVICE.create_temp_dir()
    pptx_creator = PptxPresentationCreator(pptx_model, temp_dir)
    await pptx_creator.create_ppt()

    export_directory = get_exports_directory()  # /app_data/exports/
    pptx_path = os.path.join(export_directory, f"{pptx_model.name}.pptx")
    pptx_creator.save(pptx_path)

    return pptx_path  # "/app_data/exports/my-presentation.pptx"
```

##### 4A. Initialize PptxPresentationCreator

**File**: `servers/fastapi/services/pptx_presentation_creator.py:51-62`

```python
class PptxPresentationCreator:
    def __init__(self, ppt_model: PptxPresentationModel, temp_dir: str):
        self._ppt_model = ppt_model
        self._temp_dir = temp_dir

        # Create blank PowerPoint using python-pptx
        self._ppt = Presentation()
        self._ppt.slide_width = Pt(1280)   # 1280 points
        self._ppt.slide_height = Pt(720)   # 720 points
```

Uses **python-pptx** library to programmatically create PowerPoint files.

##### 4B. Download Network Images

```python
async def fetch_network_assets(self):
    image_urls = []
    models_with_network_asset = []

    # Collect all image URLs from shapes
    for slide in self._slide_models:
        for shape in slide.shapes:
            if isinstance(shape, PptxPictureBoxModel):
                if shape.picture.path.startswith("http"):
                    image_urls.append(shape.picture.path)
                    models_with_network_asset.append(shape)

    # Download all images concurrently to temp directory
    image_paths = await download_files(image_urls, self._temp_dir)

    # Update shapes with local file paths
    for shape, path in zip(models_with_network_asset, image_paths):
        shape.picture.path = path
        shape.picture.is_network = False
```

##### 4C. Create Each Slide

For each slide in the PPTX model:

```python
def add_and_populate_slide(self, slide_model: PptxSlideModel):
    # Add blank slide (layout 6 = blank)
    slide = self._ppt.slides.add_slide(self._ppt.slide_layouts[6])

    # Set background color
    if slide_model.background:
        self.apply_fill_to_shape(slide.background, slide_model.background)

    # Add all shapes
    for shape in slide_model.shapes:
        if isinstance(shape, PptxTextBoxModel):
            self.add_text_box(slide, shape)
        elif isinstance(shape, PptxPictureBoxModel):
            self.add_picture_box(slide, shape)
        elif isinstance(shape, PptxAutoShapeBoxModel):
            self.add_autoshape_box(slide, shape)
        elif isinstance(shape, PptxConnectorModel):
            self.add_connector(slide, shape)

    # Add speaker notes
    if slide_model.note:
        slide.notes_slide.notes_text_frame.text = slide_model.note
```

**For Text Boxes:**

```python
def add_text_box(self, slide, text_box_model: PptxTextBoxModel):
    # Create text box at specified position
    shape = slide.shapes.add_textbox(
        left=Pt(text_box_model.position.left),
        top=Pt(text_box_model.position.top),
        width=Pt(text_box_model.position.width),
        height=Pt(text_box_model.position.height)
    )

    # Set margins
    text_frame = shape.text_frame
    text_frame.margin_left = Pt(text_box_model.margin.left)
    text_frame.margin_right = Pt(text_box_model.margin.right)
    text_frame.margin_top = Pt(text_box_model.margin.top)
    text_frame.margin_bottom = Pt(text_box_model.margin.bottom)

    # Set text wrapping
    text_frame.word_wrap = text_box_model.text_wrap

    # Add paragraphs with formatting
    for para_model in text_box_model.paragraphs:
        p = text_frame.add_paragraph()

        # Set paragraph alignment
        p.alignment = para_model.alignment  # PP_ALIGN.LEFT/CENTER/RIGHT

        # Set line spacing if specified
        if para_model.line_height:
            p.line_spacing = para_model.line_height

        # Add text runs with inline formatting
        for text_run in para_model.text_runs:
            run = p.add_run()
            run.text = text_run.text

            # Apply font properties
            if text_run.font:
                run.font.name = text_run.font.name
                run.font.size = Pt(text_run.font.size)
                run.font.bold = text_run.font.weight >= 700
                run.font.italic = text_run.font.italic
                run.font.color.rgb = RGBColor.from_string(text_run.font.color)
```

**For Images:**

```python
def add_picture_box(self, slide, picture_box_model: PptxPictureBoxModel):
    image_path = picture_box_model.picture.path

    # Apply image transformations if needed
    if picture_box_model.shape == PptxBoxShapeEnum.CIRCLE:
        image_path = create_circle_image(image_path, self._temp_dir)

    if picture_box_model.border_radius:
        image_path = round_image_corners(
            image_path,
            picture_box_model.border_radius,
            self._temp_dir
        )

    if picture_box_model.invert:
        image_path = invert_image(image_path, self._temp_dir)

    if picture_box_model.opacity and picture_box_model.opacity < 1:
        image_path = set_image_opacity(
            image_path,
            picture_box_model.opacity,
            self._temp_dir
        )

    if picture_box_model.object_fit:
        image_path = fit_image(
            image_path,
            picture_box_model.object_fit.fit,  # cover/contain/fill
            self._temp_dir
        )

    # Add picture to slide
    slide.shapes.add_picture(
        image_path,
        left=Pt(picture_box_model.position.left),
        top=Pt(picture_box_model.position.top),
        width=Pt(picture_box_model.position.width),
        height=Pt(picture_box_model.position.height)
    )
```

**For AutoShapes (rounded rectangles, etc.):**

```python
def add_autoshape_box(self, slide, autoshape_model: PptxAutoShapeBoxModel):
    # Create shape
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        left=Pt(autoshape_model.position.left),
        top=Pt(autoshape_model.position.top),
        width=Pt(autoshape_model.position.width),
        height=Pt(autoshape_model.position.height)
    )

    # Set fill color
    if autoshape_model.fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor.from_string(
            autoshape_model.fill.color
        )
        if autoshape_model.fill.opacity:
            shape.fill.transparency = 1 - autoshape_model.fill.opacity

    # Set border/stroke
    if autoshape_model.stroke:
        shape.line.color.rgb = RGBColor.from_string(
            autoshape_model.stroke.color
        )
        shape.line.width = Pt(autoshape_model.stroke.thickness)

    # Set shadow (using XML manipulation)
    if autoshape_model.shadow:
        self.add_shadow_to_shape(shape, autoshape_model.shadow)

    # Add text if present
    if autoshape_model.paragraphs:
        self.add_paragraphs_to_shape(
            shape.text_frame,
            autoshape_model.paragraphs
        )
```

**For Connectors (lines):**

```python
def add_connector(self, slide, connector_model: PptxConnectorModel):
    connector = slide.shapes.add_connector(
        connector_model.type,  # STRAIGHT, ELBOW, or CURVE
        begin_x=Pt(connector_model.position.left),
        begin_y=Pt(connector_model.position.top),
        end_x=Pt(connector_model.position.left + connector_model.position.width),
        end_y=Pt(connector_model.position.top + connector_model.position.height)
    )

    # Set line properties
    connector.line.color.rgb = RGBColor.from_string(connector_model.color)
    connector.line.width = Pt(connector_model.thickness)

    if connector_model.opacity:
        connector.line.transparency = 1 - connector_model.opacity
```

##### 4D. Save PPTX File

```python
def save(self, path: str):
    self._ppt.save(path)
```

Saves PowerPoint file to `/app_data/exports/{filename}.pptx`

#### Step 5: Return File Path to Frontend

FastAPI returns: `"/app_data/exports/my-presentation.pptx"`

#### Step 6: Download File

**File**: `servers/nextjs/app/(presentation-generator)/presentation/components/Header.tsx:144-155`

```typescript
const downloadLink = (path: string) => {
  if (window.opener) {
    window.open(path, '_blank');
  } else {
    const link = document.createElement('a');
    link.href = path;
    link.download = path.split('/').pop() || 'download';
    document.body.appendChild(link);
    link.click();
  }
};
```

**File serving:**
- Browser requests: `http://localhost:5000/app_data/exports/my-presentation.pptx`
- Nginx matches: `location /app_data/exports/`
- Nginx serves: File directly from disk (no app involvement)
- Browser: Downloads PPTX file

### Visual Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│ 1. User clicks "Export as PPTX"                                │
│    (Header.tsx:handleExportPptx)                               │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. Save current presentation state                             │
│    POST /api/v1/ppt/presentation/update                        │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. Convert HTML slides to PPTX model (Next.js API Route)      │
│    GET /api/presentation_to_pptx_model?id={id}                │
│                                                                 │
│    3a. Launch Puppeteer browser (Chromium)                     │
│    3b. Navigate to /pdf-maker?id={id}                          │
│    3c. Extract DOM elements for each slide:                    │
│        - Position (getBoundingClientRect)                      │
│        - Fonts (family, size, weight, color, italic)          │
│        - Colors (background, border, shadow)                   │
│        - Layout (margin, padding, border-radius)               │
│        - Images (src, object-fit)                              │
│        - Text (innerText, innerHTML for formatting)            │
│        - Special: Screenshot SVG/canvas/tables                 │
│    3d. Convert to PptxPresentationModel JSON                   │
│        (pptx_models_utils.ts)                                  │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. Send PPTX model to FastAPI                                  │
│    POST /api/v1/ppt/presentation/export/pptx                   │
│    Body: PptxPresentationModel JSON                            │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. Create PowerPoint file (pptx_presentation_creator.py)      │
│                                                                 │
│    5a. Initialize python-pptx Presentation (1280×720)          │
│    5b. Download network images to temp directory               │
│    5c. For each slide:                                         │
│        - Add blank slide (layout 6)                            │
│        - Set background color                                  │
│        - Add text boxes with formatted text runs              │
│        - Add images (with transformations: circle, rounded,    │
│          opacity, invert, object-fit)                          │
│        - Add shapes with fill/stroke/shadow                    │
│        - Add connectors/lines                                  │
│        - Add speaker notes                                     │
│    5d. Save to /app_data/exports/{name}.pptx                   │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 6. Return file path                                            │
│    Response: "/app_data/exports/my-presentation.pptx"          │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 7. Download file (Header.tsx:downloadLink)                     │
│    - Browser: GET /app_data/exports/my-presentation.pptx       │
│    - Nginx: Serves static file from /app_data/exports/         │
│      (Or Minio if USE_MINIO=true)                              │
│    - Browser: Downloads PPTX file                              │
└────────────────────────────────────────────────────────────────┘
```

### Why This Architecture Works

**Accuracy**: Exported PowerPoint looks **identical** to web preview
- Literally extracts computed styles from rendered HTML
- No manual CSS-to-PowerPoint mapping
- What You See Is What You Get (WYSIWYG)

**Completeness**: Supports complex layouts
- Nested elements with z-index layering
- Inline text formatting (bold, italic, color)
- Images with transformations
- Shadows, borders, rounded corners
- Speaker notes

**Performance**: Efficient for batch exports
- Puppeteer screenshots only complex elements (SVG, canvas, tables)
- Text extracted as text (not images) for editability
- Images downloaded concurrently

**Maintainability**: Clear separation of concerns
- Next.js: DOM extraction (knows React components)
- FastAPI: PPTX generation (knows python-pptx)
- Type-safe data exchange via JSON models

---

## System Flow Diagrams

### Presentation Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Input (Prompt/Documents)                                │
│    Location: /upload page                                       │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Generate Outline                                             │
│    POST /api/v1/ppt/outlines/generate                           │
│    - LLM generates structured outline                           │
│    - Returns: { slides: [ { content, type }, ... ] }           │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. User Reviews/Edits Outline                                   │
│    Location: /outline page                                      │
│    - Can add/remove/reorder slides                              │
│    - Select template                                            │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Generate Full Presentation                                   │
│    POST /api/v1/ppt/presentation/generate                       │
│                                                                  │
│    For each slide:                                              │
│      4a. LLM generates content                                  │
│          - Title, bullet points, speaker notes                  │
│      4b. Generate/fetch images                                  │
│          - DALL-E 3 / Gemini Flash                              │
│          - Pexels/Pixabay stock photos                          │
│      4c. Populate template layout                               │
│          - Match content to layout placeholders                 │
│      4d. Save to database                                       │
│          - PresentationModel + SlideModel records               │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Display Presentation                                         │
│    Location: /presentation?id={uuid}                            │
│    - GET /api/v1/ppt/presentation/{id}                          │
│    - Render slides with presentation-templates components      │
│    - Enable editing, regeneration, export                       │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Environment Variables (docker-compose.yml)                      │
│ - LLM, OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.                 │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ start.js reads environment variables                            │
│                                                                  │
│ If CAN_CHANGE_KEYS=true:                                        │
│   - Creates /app_data/userConfig.json                           │
│   - Stores: LLM, API keys, models, feature flags               │
│                                                                  │
│ If CAN_CHANGE_KEYS=false:                                       │
│   - Environment variables used directly                         │
│   - No userConfig.json created                                  │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Next.js: ConfigurationInitializer component                     │
│ - Fetches /api/can-change-keys                                  │
│ - If true: Fetches /api/user-config                             │
│ - Dispatches to Redux store (userConfig slice)                 │
│                                                                  │
│ Redux State:                                                    │
│   - can_change_keys: boolean                                    │
│   - enable_custom_templates: boolean                            │
│   - llm_config: { LLM, keys, models, ... }                     │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Components access config via useSelector                        │
│                                                                  │
│ Example:                                                        │
│   const config = useSelector((s: RootState) => s.userConfig);  │
│   if (config.enable_custom_templates) { ... }                  │
└─────────────────────────────────────────────────────────────────┘
```

### Request Routing Through Nginx

```
┌─────────────────────────────────────────────────────────────────┐
│          Browser: http://localhost:5000{path}                   │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                Docker: Port 5000 → Container Port 80             │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Nginx (Port 80) - Routes by URL Path          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ location / { ... }                                        │  │
│  │   → http://localhost:3000                                 │  │
│  │   Matches: /dashboard, /upload, /presentation, etc.      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ location /api/v1/ { ... }                                 │  │
│  │   → http://localhost:8000                                 │  │
│  │   Matches: /api/v1/ppt/*, FastAPI endpoints              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ location /mcp/ { ... }                                    │  │
│  │   → http://localhost:8001/mcp/                            │  │
│  │   Matches: /mcp/*, MCP server                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ location /app_data/images/ { ... }                        │  │
│  │   → alias /app_data/images/                               │  │
│  │   Direct file serving (no proxy)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ location /app_data/exports/ { ... }                       │  │
│  │   → alias /app_data/exports/                              │  │
│  │   Direct file serving (no proxy)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### Storage Abstraction

**File**: `servers/fastapi/services/storage_service.py`

Provides unified interface for Minio (S3) or local filesystem storage:

```python
class StorageService:
    def __init__(self):
        self.use_minio = get_use_minio_env()  # Environment variable
        self.bucket_name = get_minio_bucket_env()

        if self.use_minio:
            self._initialize_minio()
        else:
            logger.info("Using local filesystem storage")

    async def upload_file(self, file_data: bytes, folder: str, filename: str) -> str:
        object_key = f"{folder}/{filename}"

        if self.use_minio and self.minio_client:
            # Upload to Minio
            self.minio_client.put_object(
                self.bucket_name, object_key,
                BytesIO(file_data), len(file_data)
            )
            return f"/app_data/{object_key}"
        else:
            # Save to local filesystem
            local_path = os.path.join(
                get_app_data_directory_env(), folder, filename
            )
            with open(local_path, "wb") as f:
                f.write(file_data)
            return local_path

    async def delete_file(self, file_path: str):
        if self.use_minio:
            # Delete from Minio
            object_name = file_path.replace("/app_data/", "")
            self.minio_client.remove_object(self.bucket_name, object_name)
        else:
            # Delete from local filesystem
            if os.path.exists(file_path):
                os.remove(file_path)
```

**Usage:**

```python
from services.storage_service import get_storage_service

storage = get_storage_service()
image_path = await storage.upload_file(image_bytes, "images", "photo.jpg")
# Returns: "/app_data/images/photo.jpg" (works with both Minio and local)
```

**Why this matters:**
- ✅ Zero code changes to switch storage backends
- ✅ Development uses local filesystem
- ✅ Production can use Minio for scalability
- ✅ Same path format works with Nginx static serving

### LLM Provider Abstraction

**File**: `servers/fastapi/services/llm_client.py`

Unified interface for multiple LLM providers:

```python
async def generate_completion(
    messages: list,
    model: str,
    provider: str,
    response_format: Optional[dict] = None,  # For JSON schema
    stream: bool = False
):
    if provider == "openai":
        return await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            response_format=response_format,
            stream=stream
        )

    elif provider == "anthropic":
        return await anthropic_client.messages.create(
            model=model,
            messages=messages,
            # Anthropic uses tools for structured output
            tools=[{"name": "output", "input_schema": response_format}] if response_format else None,
            stream=stream
        )

    elif provider == "google":
        return await google_client.generate_content(
            model=model,
            contents=messages,
            generation_config={"response_mime_type": "application/json"} if response_format else None
        )

    elif provider == "ollama":
        return await ollama_generate(
            model=model,
            messages=messages,
            format="json" if response_format else None,
            stream=stream
        )

    elif provider == "custom":
        # OpenAI-compatible API
        return await custom_openai_client.chat.completions.create(
            model=model,
            messages=messages,
            response_format=response_format,
            stream=stream
        )
```

**Features:**
- ✅ Streaming responses (SSE)
- ✅ Structured output (JSON schema validation)
- ✅ Tool/function calling
- ✅ Web grounding (for supported providers)
- ✅ Provider-specific message format conversion

### Template System

Templates are React components in `servers/nextjs/presentation-templates/`:

**Structure:**
```
presentation-templates/
├── general/
│   ├── index.ts              # Exports all layouts
│   ├── TitleSlide.tsx
│   ├── ContentSlide.tsx
│   ├── ListSlide.tsx
│   ├── QuoteSlide.tsx
│   └── ImageSlide.tsx
├── modern/
├── standard/
└── swift/
```

**How it works:**

1. **Backend stores template reference:**
```python
presentation = PresentationModel(
    layout={
        "templateID": "general",
        "slides": [
            {"layoutId": "title_slide"},
            {"layoutId": "content_slide"},
            {"layoutId": "list_slide"}
        ]
    }
)
```

2. **Frontend loads template dynamically:**
```typescript
import * as GeneralTemplate from '@/presentation-templates/general';

const LayoutComponent = GeneralTemplate[slide.layout.layoutId];
<LayoutComponent data={slide.content} />
```

3. **Backend converts HTML to PPTX:**
- Puppeteer renders React component
- Extracts DOM properties
- python-pptx recreates in PowerPoint

**Custom Templates:**
Users can upload PPTX files which are:
1. Parsed by Anthropic Claude (vision model)
2. Converted to React component code
3. Stored in database as `TemplateModel`
4. Available for presentation generation

### Database Architecture

**Technology**: SQLite (default), supports PostgreSQL/MySQL via `DATABASE_URL`

**Key Tables:**

```sql
-- Presentations
CREATE TABLE presentations (
    id UUID PRIMARY KEY,
    title TEXT,
    content TEXT,              -- Original prompt
    n_slides INTEGER,
    language TEXT,
    tone TEXT,                 -- casual/professional/enthusiastic
    verbosity TEXT,            -- brief/detailed/comprehensive
    instructions TEXT,
    outlines JSON,             -- Generated outline
    layout JSON,               -- Template reference
    structure JSON,            -- Slide layout mapping
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Slides
CREATE TABLE slides (
    id UUID PRIMARY KEY,
    presentation UUID REFERENCES presentations(id),
    index INTEGER,
    layout_id TEXT,            -- Layout component name
    content JSON,              -- Slide data (title, bullets, images)
    created_at TIMESTAMP
);

-- Custom Templates
CREATE TABLE templates (
    id UUID PRIMARY KEY,
    name TEXT,
    description TEXT,
    created_at TIMESTAMP
);

-- Template Layout Codes (React components)
CREATE TABLE presentation_layout_codes (
    id UUID PRIMARY KEY,
    template_id UUID REFERENCES templates(id),
    layout_name TEXT,
    code TEXT,                 -- React component code
    sample_data JSON,
    created_at TIMESTAMP
);

-- Image Assets
CREATE TABLE image_assets (
    id UUID PRIMARY KEY,
    path TEXT,
    is_uploaded BOOLEAN,       -- vs. AI-generated
    created_at TIMESTAMP
);

-- Webhooks
CREATE TABLE webhooks (
    id UUID PRIMARY KEY,
    url TEXT,
    event TEXT,                -- presentation_created, presentation_updated
    created_at TIMESTAMP
);

-- Async Task Tracking
CREATE TABLE async_presentation_generation_tasks (
    id UUID PRIMARY KEY,
    status TEXT,               -- pending/processing/completed/failed
    message TEXT,
    progress INTEGER,
    presentation_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Relationships:**
- `presentations` ← 1:N → `slides`
- `templates` ← 1:N → `presentation_layout_codes`
- All using async SQLAlchemy with SQLModel

---

## File Structure Reference

### Backend (FastAPI)

```
servers/fastapi/
├── api/
│   ├── lifespan.py                    # Startup/shutdown handlers
│   └── v1/ppt/endpoints/
│       ├── presentation.py            # Main API endpoints
│       ├── images.py                  # Image upload/generation
│       ├── files.py                   # Document upload
│       ├── pptx_slides.py            # PPTX-specific operations
│       └── template_management.py     # Custom templates
├── services/
│   ├── llm_client.py                 # Unified LLM interface
│   ├── pptx_presentation_creator.py  # PowerPoint generation
│   ├── image_generation_service.py   # DALL-E/Gemini/Pexels
│   ├── documents_loader.py           # Docling integration
│   ├── storage_service.py            # Minio/local storage
│   ├── database.py                   # SQLModel setup
│   └── html_to_text_runs_service.py  # HTML → PPTX text
├── models/
│   ├── sql/                          # Database models
│   │   ├── presentation.py
│   │   ├── slide.py
│   │   └── template.py
│   ├── pptx_models.py               # PPTX structure models
│   └── presentation_outline_model.py # Outline generation
├── utils/
│   ├── llm_calls/                   # LLM-based functions
│   │   ├── generate_presentation_outlines.py
│   │   ├── generate_slide_content.py
│   │   └── generate_presentation_structure.py
│   ├── export_utils.py              # PPTX/PDF export
│   └── asset_directory_utils.py     # File path helpers
├── constants/
│   └── presentation.py              # Default templates, prompts
├── enums/
│   ├── llm_provider.py
│   ├── tone.py
│   └── verbosity.py
├── server.py                        # FastAPI entry point
└── mcp_server.py                    # Model Context Protocol server
```

### Frontend (Next.js)

```
servers/nextjs/
├── app/
│   ├── api/                         # Next.js API routes
│   │   ├── presentation_to_pptx_model/route.ts  # Puppeteer conversion
│   │   ├── export-as-pdf/route.ts
│   │   ├── user-config/route.ts
│   │   └── can-change-keys/route.ts
│   ├── (presentation-generator)/   # Route group
│   │   ├── upload/                 # Initial prompt input
│   │   ├── outline/                # Review/edit outline
│   │   ├── presentation/           # Slide editor
│   │   ├── custom-template/        # HTML template creation
│   │   ├── dashboard/              # Presentation management
│   │   ├── settings/               # API keys, models
│   │   ├── context/
│   │   │   └── LayoutContext.tsx   # Template loading
│   │   └── services/api/
│   │       └── presentation-generation.ts  # API client
│   ├── ConfigurationInitializer.tsx # Load user config
│   └── layout.tsx
├── components/                     # Shared React components
│   └── ui/                        # shadcn/ui components
├── store/                         # Redux Toolkit
│   ├── store.ts
│   └── slices/
│       ├── presentationGeneration.ts
│       ├── userConfig.ts
│       └── undoRedoSlice.ts
├── presentation-templates/        # HTML/Tailwind slide templates
│   ├── general/
│   ├── modern/
│   ├── standard/
│   └── swift/
├── utils/
│   ├── pptx_models_utils.ts      # DOM → PPTX conversion
│   └── mixpanel.ts               # Analytics
├── types/
│   ├── pptx_models.ts            # TypeScript PPTX types
│   └── element_attibutes.ts     # Puppeteer extraction types
└── next.config.mjs               # Next.js configuration
```

### Root Directory

```
presonton/
├── nginx.conf                    # Nginx configuration
├── docker-compose.yml            # Docker services
├── Dockerfile                    # Production image
├── Dockerfile.dev                # Development image
├── start.js                      # Process orchestrator
├── CLAUDE.md                     # Claude Code instructions
├── SYSTEM_ARCHITECTURE.md        # This file
├── app_data/                     # Volume mount (not in repo)
│   ├── images/
│   ├── exports/
│   ├── uploads/
│   ├── fonts/
│   └── userConfig.json
└── servers/
    ├── fastapi/
    └── nextjs/
```

---

## Summary: Key Takeaways

1. **Hybrid Architecture**: Next.js (UI/Puppeteer) + FastAPI (AI/PPTX) = Best of both worlds

2. **Nginx is Critical**: Not optional - orchestrates all services and serves static files at 10-100x speed

3. **PPTX Export**: Most complex operation, uses Puppeteer to extract DOM → python-pptx to generate PowerPoint

4. **Type Safety**: TypeScript (frontend) + Pydantic (backend) with shared JSON models

5. **Storage Abstraction**: Seamless switch between local filesystem and Minio S3

6. **LLM Abstraction**: Unified interface for OpenAI, Anthropic, Google, Ollama, custom APIs

7. **Template System**: React components used for both web preview and PPTX export

8. **Scalability**: Independent scaling of UI (Next.js), API (FastAPI), and storage (Minio)

---

**Maintained by**: Presentation Agent Team
**For questions**: Refer to `CLAUDE.md` for development guidelines
