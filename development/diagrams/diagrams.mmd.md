~~~md
# Diagramas Mermaid (source of truth visual)

---

## 1) Arquitectura general (solo FE + BE + DB)
```mermaid
flowchart LR
  U[Usuario Mobile/Desktop] --> FE[Frontend Next.js]
  FE -->|REST JSON| BE[Backend Express]
  BE --> DB[(PostgreSQL)]
  BE --> ST[(Object Storage - assets privados)]
  FE -->|URLs firmadas (read)| ST
```

---

## 2) Secuencia: Upload (Signed URL) + Procesamiento en Backend (KISS)
```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant ST as Storage
  participant DB as PostgreSQL

  FE->>BE: POST /api/assets/upload-url (versionId, meta)
  BE->>DB: create Asset (PENDING_UPLOAD)
  BE-->>FE: signed PUT url + assetId
  FE->>ST: PUT model.glb
  FE->>BE: POST /api/assets/complete (assetId, etag)
  BE->>DB: Asset = UPLOADED
  BE->>DB: Asset = PROCESSING
  BE->>ST: GET model.glb (private)
  BE->>BE: validate + (optional) optimize + generate thumbnail/(usdz)
  BE->>ST: PUT optimized + thumb + (usdz)
  BE->>DB: Asset = READY (or FAILED)
```

---

## 3) Secuencia: Experiencia pública (Share)
```mermaid
sequenceDiagram
  participant U as Usuario
  participant FE as Frontend (/experience/:token)
  participant BE as Backend
  participant ST as Storage

  U->>FE: open /experience/:token
  FE->>BE: GET /api/public/experience/:token
  BE->>BE: validate share (expiry/revoked/maxVisits)
  BE-->>FE: metadata + signed read URLs
  FE->>ST: GET GLB (signed)
  FE->>BE: POST /api/public/visits/start
  FE->>BE: POST /api/public/visits/end (durationMs, usedAR)
```

---

## 4) ER Diagram (alto nivel)
```mermaid
erDiagram
  COMPANY ||--o{ USER : has
  COMPANY ||--o{ PROJECT : has
  PROJECT ||--o{ PRODUCT : groups
  PRODUCT ||--o{ VERSION : has
  VERSION ||--o{ ASSET : stores
  VERSION ||--o{ SHARE : shares
  SHARE ||--o{ VISIT : logs
```
```