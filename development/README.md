# Development Docs — Web App 3D + AR (Industrial)

Esta carpeta es la **fuente única de verdad** (Single Source of Truth) para implementar el producto.

---

## Principios obligatorios (NO negociables)
- **SOLID** (crucial)
- **DRY**
- **KISS**
- **YAGNI**

**Regla de mantenimiento:** si un cambio impacta **flujos**, **API** o **modelo de datos**, se deben actualizar **estas documentaciones** en el mismo PR/commit.

---

## Objetivo de esta documentación
1) Definir **arquitectura**, **contratos (API)** y **datos** de manera clara.  
2) Detallar **etapas de implementación por fase** con **entregables concretos**.  
3) Incluir **testings mínimos esenciales** y **QA checklist por etapa**.  
4) Ser la **fuente única de verdad** para desarrollar el producto.

---

## Estructura del repositorio (ROOT) — SOLO 3 carpetas
> Aclaración obligatoria: el repo contiene únicamente `backend/`, `frontend/` y `development/`.

```
/
  backend/
  frontend/
  development/
```

---

## Stack target (OBLIGATORIO)

### Frontend (`/frontend`)
- **Next.js** (App Router) + React
- Viewer 3D: **Babylon.js**
- Styling: Tailwind (o equivalente consistente)
- Data fetching: React Query (recomendado)

### Backend (`/backend`)
- **Node.js + Express**
- ORM: **Prisma**
- DB: **PostgreSQL** (dev y prod)
- Auth: JWT (access + refresh)
- Validación requests: express-validator (o Zod; elegir 1 y estandarizar)

### Deploy
- Deploy en **AWS usando Amplify**
- Base de datos PostgreSQL en **AWS** (p.ej. RDS)

> Importante: esta documentación evita complejidad innecesaria.  
> No define workers, colas, infra avanzada ni DevOps detallado.  
> Solo **frontend + backend** con responsabilidades claras.

---

## Estructura de documentación (`/development`)
Dentro de `development/` se organiza todo lo necesario (fases, arquitectura, API, datos y diagramas):

```
development/
  README.md                         # este archivo
  phases/
    mvp.md                          # etapas, entregables, unit tests y QA del MVP
    full.md                         # etapas, entregables, unit tests y QA del Completo
  architecture/
    system-architecture.md          # arquitectura clara frontend/backend + flujos
  api/
    api-spec.md                     # contrato REST detallado (source of truth)
  data/
    data-model.md                   # modelo de datos + índices + reglas multi-tenant
  diagrams/
    diagrams.mmd                    # diagramas Mermaid (arquitectura + secuencias + ER)
```

---

## Uso y regla de consistencia (muy importante)
- `api/api-spec.md` define el **contrato**. Si cambia request/response, auth o permisos → **se actualiza**.
- `data/data-model.md` define el **modelo de datos**. Si cambia schema/relaciones/índices → **se actualiza**.
- `architecture/system-architecture.md` define **flujos y responsabilidades**. Si cambia un flujo crítico → **se actualiza**.
- `phases/*.md` define **etapas por fase** con **entregables + unit tests esenciales + QA checklist**.  
  Si se agrega o modifica una etapa o entregable → **se actualiza**.

---

## Definiciones clave (glosario mínimo)
- **Tenant / Company**: empresa (aislamiento lógico multi-tenant).
- **Project**: agrupador de productos.
- **Product**: maquinaria/equipo.
- **Version**: versión de un producto.
- **Asset**: archivo derivado (GLB optimizado, USDZ, thumbnail).
- **Share**: link temporal seguro para compartir experiencia.
- **Visit**: evento de tracking (analytics).

---

## Convenciones de ingeniería (para asegurar SOLID/DRY/KISS/YAGNI)
- TypeScript estricto en frontend y backend.
- Errores API normalizados (ver `api/api-spec.md`).
- Multi-tenant enforcement obligatorio en backend (ver `data/data-model.md`).
- Cada etapa debe incluir:
  - **Entregables concretos**
  - **Unit tests esenciales (mínimos)**
  - **QA checklist (mínimo)**
- Cualquier feature nueva debe justificar:
  - por qué no rompe **YAGNI**
  - por qué no agrega complejidad contra **KISS**
  - cómo se mantiene **DRY**
  - cómo respeta **SOLID** (especialmente separación de responsabilidades)