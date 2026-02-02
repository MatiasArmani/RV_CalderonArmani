# Storage Conventions & Policies

**Fuente única de verdad** para gestión de archivos (assets) en object storage.
Define naming, paths, TTLs, visibilidad y cleanup.

---

## 1) Stack de Storage (obligatorio)

- **Proveedor**: AWS S3 (o compatible S3 en AWS)
- **SDK**: AWS SDK v3 para Node.js (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- **Acceso**: Todo vía signed URLs (pre-signed URLs)
- **Bucket**: 1 bucket privado para todos los assets

### Configuración Bucket (obligatoria)
- **Visibilidad**: Privado (block all public access)
- **CORS**: Configurado para dominios del frontend (ver sección Seguridad)
- **Versioning**: Deshabilitado en MVP (YAGNI)
- **Lifecycle**: Políticas de expiración (ver sección Cleanup)

---

## 2) Estructura de `storageKey` (naming estable)

Todos los assets siguen esta convención jerárquica:

```
{companyId}/projects/{projectId}/products/{productId}/versions/{versionId}/{assetKind}/{filename}
```

### Ejemplo completo:
```
abc-123-company-uuid/projects/proj-456/products/prod-789/versions/ver-001/source/model_original.glb
abc-123-company-uuid/projects/proj-456/products/prod-789/versions/ver-001/thumb/thumb_asset-uuid.jpg
abc-123-company-uuid/projects/proj-456/products/prod-789/versions/ver-001/usdz/model_asset-uuid.usdz
```

### Componentes:

1. **`{companyId}`**: UUID de Company (tenant isolation a nivel storage)
2. **`projects/{projectId}`**: UUID de Project
3. **`products/{productId}`**: UUID de Product
4. **`versions/{versionId}`**: UUID de Version
5. **`{assetKind}`**: Tipo de asset:
   - `source`: GLB original subido por usuario
   - `optimized`: GLB optimizado (Fase 2, en MVP no se usa)
   - `thumb`: Thumbnails (JPEG)
   - `usdz`: Archivos USDZ para iOS AR
6. **`{filename}`**: Nombre de archivo estable:
   - Source GLB: `model_original.glb` (siempre igual, sobrescribe si re-upload)
   - Thumb: `thumb_{assetId}.jpg` (único por asset)
   - USDZ: `model_{assetId}.usdz` (único por asset)

### Reglas de Naming:
- **Sin espacios**: usar guiones bajos `_` o guiones medios `-`
- **Lowercase preferido** (para evitar case-sensitivity issues)
- **No caracteres especiales**: solo `a-z`, `0-9`, `-`, `_`, `.`
- **Extensiones explícitas**: `.glb`, `.jpg`, `.usdz`

---

## 3) TTL de Signed URLs

Signed URLs tienen tiempo de vida limitado por seguridad.

### Upload (PUT)
- **TTL**: 15 minutos (900 segundos)
- **Uso**: Usuario sube archivo desde frontend
- **Generación**: `POST /api/assets/upload-url` retorna signed PUT URL
- **Límites**:
  - 1 URL por asset
  - Single upload (no multipart en MVP)
  - Expira si no se usa en 15 min

**Implementación (AWS SDK v3)**:
```typescript
import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const command = new PutObjectCommand({
  Bucket: process.env.AWS_S3_BUCKET,
  Key: storageKey,
  ContentType: contentType,
})

const url = await getSignedUrl(s3Client, command, { expiresIn: 900 }) // 15 min
```

### Read (GET)
- **TTL**: 1 hora (3600 segundos)
- **Uso**: Frontend descarga GLB/USDZ/thumb para viewer
- **Generación**:
  - Admin: `GET /api/assets/:id` retorna signed GET URL en `meta`
  - Public: `GET /api/public/experience/:token` retorna URLs firmadas
- **Refreshable**: Frontend puede solicitar nueva URL si expira

**Implementación**:
```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3'

const command = new GetObjectCommand({
  Bucket: process.env.AWS_S3_BUCKET,
  Key: storageKey,
})

const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hora
```

### Consideraciones:
- **No cachear signed URLs en frontend** por >50% del TTL
- Si URL expira durante uso: mostrar error + botón "Recargar"
- Backend puede generar nueva URL on-demand sin costo significativo

---

## 4) Visibilidad y Permisos

### Regla absoluta: TODO es privado
- **Bucket**: Block all public access
- **Assets**: Ningún objeto es público directamente
- **Acceso**: Solo vía signed URLs generadas por backend

### Control de Acceso por Endpoint:

#### Admin (privado, requiere auth):
- `GET /api/assets/:id`:
  - Valida que asset pertenece al `companyId` del usuario (JWT)
  - Retorna signed GET URL
- `POST /api/assets/upload-url`:
  - Valida que version pertenece al `companyId`
  - Retorna signed PUT URL

#### Public (sin auth, pero validado por share token):
- `GET /api/public/experience/:token`:
  - Valida share (no expirado, no revocado, maxVisits OK)
  - Retorna signed GET URLs de assets asociados
  - **NO expone** storageKey ni metadata interna

### Aislamiento Multi-Tenant:
- StorageKey incluye `companyId` como prefijo
- Backend SIEMPRE valida tenant antes de generar signed URL
- Tests negativos obligatorios: usuario de Company A no puede generar URL de asset de Company B

---

## 5) Políticas de Cleanup (mínimas MVP)

### Assets en estado `PENDING_UPLOAD` (zombie uploads)
- **Problema**: Usuario solicita upload URL pero nunca sube el archivo
- **Solución MVP**:
  - Backend NO crea objeto en S3 hasta que FE llama `complete`
  - Si Asset queda en `PENDING_UPLOAD` >24h:
    - Job diario (cron) marca como `FAILED` con `errorMessage: "Upload timeout"`
    - No hay archivo en S3 que limpiar
- **Fase 2**: Job más sofisticado que limpia registros `FAILED` antiguos

### Assets en estado `FAILED` (uploads incompletos en S3)
- **Problema**: Upload parcial o procesamiento fallido deja objeto en S3
- **Solución**:
  - S3 Lifecycle Policy: elimina objetos con prefix `{companyId}/` después de 7 días si están "incomplete"
  - Backend: Job semanal opcional que reconcilia DB vs S3 (Fase 2)

### Deletion de Version/Product/Project (cascade)
- **Problema**: Usuario elimina Version → assets huérfanos en S3
- **Solución MVP**:
  1. Backend `DELETE /api/versions/:id`:
     - Elimina registros Asset en DB (cascade por FK)
     - Elimina objetos en S3 (loop async):
       ```typescript
       for (const asset of assets) {
         await s3Client.send(new DeleteObjectCommand({
           Bucket: bucket,
           Key: asset.storageKey
         }))
       }
       ```
  2. Si falla eliminación en S3:
     - Loguear error
     - No bloquear operación (DB ya eliminado)
     - S3 Lifecycle limpiará eventualmente (Fase 2)

### S3 Lifecycle Rules (recomendadas)
```json
{
  "Rules": [
    {
      "Id": "cleanup-incomplete-uploads",
      "Status": "Enabled",
      "Prefix": "",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 1
      }
    },
    {
      "Id": "cleanup-old-failed-assets",
      "Status": "Enabled",
      "Prefix": "",
      "Expiration": {
        "Days": 30
      },
      "Filter": {
        "Tag": {
          "Key": "status",
          "Value": "failed"
        }
      }
    }
  ]
}
```
(Tagging de objetos se agrega en Fase 2 si es necesario; MVP sin tags)

---

## 6) CORS Configuration (obligatoria para frontend)

Para que frontend pueda subir directamente vía signed URL:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://<frontend-domain>.amplifyapp.com",
        "https://<custom-domain>"
      ],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

**Importante**:
- En producción, restringir `AllowedOrigins` solo a dominios del frontend
- NO usar `"*"` en producción
- `ExposeHeaders: ["ETag"]` necesario para `complete` endpoint (validación)

---

## 7) Límites y Quotas (MVP)

### Por Asset:
- **Max size upload**: 100 MB (104857600 bytes)
- **Timeout upload**: 15 minutos (signed URL TTL)
- **Timeout processing**: 2 minutos

### Por Tenant (opcional MVP, recomendado Fase 2):
- **Max storage total**: Sin límite en MVP (monitorear en producción)
- **Max assets por version**: Sin límite en MVP
- **Rate limiting**: Ver `security.md` / `api-spec.md`

### S3 Bucket (cuotas AWS estándar):
- No hay límite de objetos por bucket
- Throughput: según tier (suficiente para MVP)

---

## 8) Backup y Disaster Recovery (fuera de alcance MVP)

**MVP**: Sin backup automático (YAGNI)
**Fase 2** (si requerido):
- S3 Versioning habilitado
- S3 Cross-Region Replication (si crítico)
- Backup DB incluye referencias a storageKeys (ya incluido en Prisma/PostgreSQL backup)

---

## 9) Monitoreo y Logs (mínimo MVP)

### Logs obligatorios (backend):
- Cada generación de signed URL:
  ```
  [INFO] Generated upload URL: assetId={id}, companyId={id}, storageKey={key}
  [INFO] Generated read URL: assetId={id}, companyId={id}
  ```
- Errores S3:
  ```
  [ERROR] S3 upload failed: assetId={id}, error={message}
  [ERROR] S3 delete failed: storageKey={key}, error={message}
  ```

### Métricas recomendadas (Fase 2):
- Tamaño promedio de assets
- Tiempo promedio de procesamiento
- Tasa de fallos upload/processing
- Storage total por tenant

---

## 10) Ejemplo Completo: Flujo de Upload con Storage

### 1. Usuario solicita upload:
```http
POST /api/assets/upload-url
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "versionId": "ver-001",
  "fileName": "model.glb",
  "contentType": "model/gltf-binary",
  "sizeBytes": 5242880
}
```

### 2. Backend genera storageKey y signed URL:
```typescript
const storageKey = `${companyId}/projects/${projectId}/products/${productId}/versions/${versionId}/source/model_original.glb`

const asset = await prisma.asset.create({
  data: {
    companyId,
    versionId,
    kind: 'SOURCE_GLB',
    status: 'PENDING_UPLOAD',
    storageKey,
    contentType,
    sizeBytes,
  }
})

const uploadUrl = await generateSignedPutUrl(storageKey, contentType, 900)

res.json({
  assetId: asset.id,
  upload: {
    url: uploadUrl,
    method: 'PUT',
    headers: { 'Content-Type': contentType }
  }
})
```

### 3. Frontend sube archivo:
```typescript
const response = await fetch(upload.url, {
  method: 'PUT',
  headers: upload.headers,
  body: file, // File object from input
})

const etag = response.headers.get('ETag')
```

### 4. Frontend confirma upload:
```http
POST /api/assets/complete
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "assetId": "asset-uuid",
  "etag": "\"abc123...\""
}
```

### 5. Backend procesa:
- Descarga de S3 (via SDK, no signed URL)
- Valida, genera derivados
- Sube derivados (thumb, usdz) a S3:
  ```typescript
  const thumbKey = `${companyId}/projects/.../thumb/thumb_${assetId}.jpg`
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: thumbKey,
    Body: thumbBuffer,
    ContentType: 'image/jpeg',
  }))
  ```
- Actualiza Asset: `status: 'READY'`, `meta: { thumbAssetId, ... }`

### 6. Frontend consume asset:
```http
GET /api/assets/{assetId}
Authorization: Bearer {accessToken}
```

Response:
```json
{
  "id": "asset-uuid",
  "status": "READY",
  "meta": {
    "glbUrl": "https://s3.../abc-123.../model_original.glb?X-Amz-...",
    "thumbUrl": "https://s3.../abc-123.../thumb_xyz.jpg?X-Amz-...",
    "usdzUrl": "https://s3.../abc-123.../model_xyz.usdz?X-Amz-..."
  }
}
```

---

## 11) Regla de Cambios (consistencia)

Si cambia:
- Estructura de `storageKey` → actualizar este archivo + migrar assets existentes (deployment script)
- TTL de signed URLs → actualizar este archivo + constantes en backend
- Políticas CORS → actualizar este archivo + aplicar en S3 bucket
- Límites de tamaño/timeout → actualizar este archivo + `mvp.md` (Etapa 4) + validaciones backend

---

**Implementación**: Este documento debe ser referenciado por el módulo `storage` en backend (`src/common/storage/` o `src/modules/assets/storage/`).
