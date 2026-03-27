# MentorDrop API Documentation

Base URL examples:
- Local: `http://localhost:3000`
- Production: `https://mentor-drop.kanayan.tech/`

## 1. Upload image (multipart)

### POST /api/upload

Uploads one file by multipart form-data and returns a URL to access it.

#### Request
- Content-Type: `multipart/form-data`
- Field:
  - `file` (required): image binary

Example with curl:

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@./capture.webp;type=image/webp"
```

#### Success response
- Status: `200 OK`

```json
{
  "fileUrl": "/api/upload/<fileId>"
}
```

#### Error responses
- Status: `400 Bad Request`

```json
{
  "error": "No file provided"
}
```

- Status: `500 Internal Server Error`

```json
{
  "error": "Upload failed"
}
```

---

## 2. Get uploaded image (legacy/upload flow)

### GET /api/upload/:fileId
Returns image binary.

### HEAD /api/upload/:fileId
Returns only headers (used by host-side existence check).

#### Success response
- Status: `200 OK`
- Headers:
  - `Content-Type: image/webp`
  - `Cache-Control: public, max-age=3600`

#### Not found
- GET: `404 Not Found`

```json
{
  "error": "File not found"
}
```

- HEAD: `404 Not Found` with empty body

---

## 3. Create post metadata

### POST /api/posts
Saves post metadata to Sheets.

#### Request
- Content-Type: `application/json`

```json
{
  "fileName": "capture-1710000000000.webp",
  "fileUrl": "/api/upload/<fileId>",
  "frameId": "circle",
  "lane": "C",
  "scale": 1
}
```

#### Validation rules
- `frameId`: one of configured frame ids
- `lane`: one of configured lanes
- `scale`: number in range `0..2`
- `fileName`, `fileUrl`: string

#### Success response
- Status: `200 OK`

```json
{
  "ok": true,
  "row": {
    "id": "uuid",
    "fileName": "capture-1710000000000.webp",
    "fileUrl": "/api/upload/<fileId>",
    "frameId": "circle",
    "lane": "C",
    "scale": 1,
    "createdAt": "2026-03-28T00:00:00.000Z"
  }
}
```

#### Error response
- Status: `400 Bad Request`

```json
{
  "error": "Invalid payload"
}
```

### GET /api/posts
Gets latest post rows (up to 100).

#### Success response
- Status: `200 OK`

```json
{
  "ok": true,
  "rows": [
    ["id", "fileName", "fileUrl", "frameId", "lane", "scale", "createdAt"]
  ]
}
```

---

## 4. iPhone app image API (JSON Base64)

### POST /api/images
Accepts JSON payload from external app and returns a web-usable image URL.

#### Request
- Content-Type: `application/json`

```json
{
  "fileName": "photo.jpg",
  "contentType": "image/jpeg",
  "imageBase64": "UklGRjIAAABXRUJQVlA4ICYAAADQAQCdASoQABAAPzmEuVOvKSWi/wEAAP7/QAA="
}
```

#### Notes
- Current server requires decoded image data to be WebP bytes.
- `contentType` is accepted as a string but not enforced for matching actual bytes.
- If data is not valid Base64 or not WebP, request fails with `invalid_image`.

#### Success response
- Status: `201 Created`

```json
{
  "id": "img_xxxxx",
  "imageUrl": "/api/images/img_xxxxx"
}
```

#### Error response
- Status: `400 Bad Request`

```json
{
  "error": "invalid_image"
}
```

---

## 5. Get image created by /api/images

### GET /api/images/:id
Returns image binary.

### HEAD /api/images/:id
Returns only headers.

#### Success response
- Status: `200 OK`
- Headers:
  - `Cache-Control: public, max-age=3600`
  - `Content-Type`: detected from bytes (`image/webp`, `image/jpeg`, `image/png`, or `application/octet-stream`)

#### Not found
- GET: `404 Not Found`

```json
{
  "error": "not_found"
}
```

- HEAD: `404 Not Found` with empty body

---

## Operational behavior notes

- Image data is cached in local temporary storage for fast reads.
- Drive is used for persistence when available.
- In local/dev where Drive credentials are missing, upload endpoints can fall back to local-only ids.
- For stable cross-instance access, configure Drive credentials in environment variables.
