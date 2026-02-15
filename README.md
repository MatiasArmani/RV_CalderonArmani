# RV_CalderonArmani

> Plataforma SaaS multi-tenant para compartir experiencias 3D/AR de productos industriales

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

---

## Descripción

RV_CalderonArmani es una plataforma web que permite a empresas industriales crear y compartir experiencias interactivas de realidad aumentada de sus productos. Los usuarios empresariales pueden subir modelos 3D de maquinaria y equipos, generar enlaces compartibles temporales, y ofrecer a sus clientes una experiencia inmersiva para visualizar productos a escala real en su entorno.

La plataforma está diseñada con una arquitectura multi-tenant segura que garantiza el aislamiento completo de datos entre empresas, siguiendo principios de diseño **SOLID**, **DRY**, **KISS** y **YAGNI**.

---

## Características Principales

### Para Empresas (Admin Panel)

#### Gestión Completa de Productos
- **Organización jerárquica**: Projects → Products → Versions
- **CRUD completo**: Crear, editar y eliminar proyectos, productos y versiones
- **Multi-tenant seguro**: Aislamiento total de datos por empresa

#### Upload y Procesamiento de Modelos 3D
- **Soporte GLB**: Archivos hasta **500MB**
- **Procesamiento automático**:
  - Validación de formato (magic bytes, estructura GLTF)
  - Generación de thumbnails (512x512 JPEG)
  - Conversión a USDZ para iOS AR
- **State machine de assets**: PENDING_UPLOAD → UPLOADED → PROCESSING → READY/FAILED
- **Signed URLs**: Upload seguro a AWS S3 con URLs firmadas (TTL 30 minutos)

#### Shares Seguros
- **Enlaces temporales**: Generación de tokens criptográficamente seguros
- **Control de acceso**:
  - Expiración por timestamp
  - Límite de visitas (maxVisits)
  - Revocación manual
- **No requiere autenticación**: Los usuarios finales no necesitan crear cuenta

#### Analytics en Tiempo Real
- **Dashboard completo** con métricas de uso:
  - Total de visitas
  - Links activos (shares con actividad)
  - Duración promedio de sesión
  - Tasa de uso AR (porcentaje de usuarios que activaron AR)
- **Visualización de datos**:
  - Gráfico de visitas por día
  - Device breakdown (mobile vs desktop)
  - Top productos más visitados
- **Filtros flexibles**: Por rango de fechas (presets y personalizado)

#### Submodelos y Variantes
- **Variantes de productos**: Diferentes colores, configuraciones o componentes
- **Selector dinámico**: Cambio en vivo sin perder estado
- **Assets independientes**: Cada variante puede tener su propio modelo 3D

---

### Para Usuarios Finales (Public Experience)

#### Visualización 3D Interactiva
- **Motor Babylon.js**: Renderizado 3D de alto rendimiento
- **Controles orbit**: Zoom, pan y rotación táctil
- **Carga optimizada**: Progress bar y estados de error claros

#### AR para Android (WebXR)
- **Hit Test**: Detección de superficies planas en tiempo real
- **Reticle visual**: Indicador verde para colocación precisa
- **Controles avanzados**:
  - **Joystick de movimiento**: Control fino de posición (0.8 m/s)
  - **Slider de rotación**: Rotación 0-360° en tiempo real
  - **Reposicionamiento**: Cambiar ubicación del modelo fácilmente
- **Bottom sheet minimizable**: UI adaptativa para vista despejada

#### AR para iOS (Quick Look)
- **USDZ nativo**: Conversión automática para compatibilidad iOS
- **Quick Look**: Experiencia AR nativa de Apple
- **Sin instalación**: Funciona directamente en Safari

#### Selector de Variantes
- **Swap en vivo**: Cambio entre submodelos sin salir de AR
- **Preservación de estado**: Mantiene posición y rotación al cambiar
- **Horizontal scroll**: UI intuitiva con pills de selección

#### Experiencia Optimizada
- **Loading states adaptivos**: Feedback visual durante todo el flujo
- **Instrucciones contextuales**: Guías según el estado del usuario
- **Error handling robusto**: Mensajes claros y accionables

---

### Casos de Uso

- **Showroom virtual** de maquinaria industrial
- **Presentaciones de productos** a distancia para clientes globales
- **Evaluación de equipos** en el sitio de instalación antes de compra
- **Marketing y ventas** con demos interactivas en ferias y eventos
- **Capacitación** visualización de equipos complejos para entrenamiento

---

## Stack Tecnológico

### Frontend
- **Framework**: Next.js 14 (App Router) + React 18
- **3D Engine**: Babylon.js 7.34 + WebXR
- **Styling**: Tailwind CSS 3.4
- **Language**: TypeScript 5.6
- **Testing**: Jest + React Testing Library

### Backend
- **Runtime**: Node.js + Express.js
- **Database**: PostgreSQL 14+
- **ORM**: Prisma 5.22
- **Auth**: JWT (access + refresh tokens)
  - Access token: 15 minutos
  - Refresh token: 30 días (httpOnly cookie)
- **Storage**: AWS S3 (signed URLs)
- **Security**:
  - helmet (headers)
  - CORS restrictivo
  - express-rate-limit
  - express-validator
- **Logging**: Winston 3.17
- **Testing**: Jest + Supertest

### Deploy
- **Hosting**: AWS Amplify
- **Database**: AWS RDS PostgreSQL
- **Storage**: AWS S3 (bucket privado)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
├──────────────────────────────┬──────────────────────────────────────┤
│      Admin Panel             │       Public Experience              │
│      (Auth Required)         │       (/experience/:token)           │
│                              │                                      │
│  • Dashboard Analytics       │  • Babylon.js 3D Viewer              │
│  • Projects CRUD             │  • WebXR AR (Android)                │
│  • Products CRUD             │  • Quick Look (iOS)                  │
│  • Versions CRUD             │  • Joystick + Rotation Controls      │
│  • Upload Assets (500MB)     │  • Submodel Selector                 │
│  • Manage Shares             │  • Visit Tracking                    │
│  • Submodels CRUD            │  • Responsive UI                     │
└──────────────────────────────┴──────────────────────────────────────┘
                                  ▼ REST API
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express)                           │
├─────────────────────────────────────────────────────────────────────┤
│  • JWT Auth (access/refresh tokens)                                 │
│  • Multi-tenant enforcement (companyId isolation)                   │
│  • Asset processing (GLB → USDZ + Thumbnail)                       │
│  • Share validation (expiration, maxVisits, revocation)            │
│  • Analytics aggregation (SQL queries)                             │
│  • Rate limiting per endpoint                                      │
└─────────────────────────────────────────────────────────────────────┘
                    ▼                                ▼
          ┌───────────────────┐          ┌───────────────────┐
          │   PostgreSQL      │          │   AWS S3          │
          │   (Prisma ORM)    │          │   (Assets)        │
          │                   │          │   - GLB files     │
          │  13 modelos:      │          │   - USDZ files    │
          │  • Company        │          │   - Thumbnails    │
          │  • User           │          │                   │
          │  • Project        │          │   Private bucket  │
          │  • Product        │          │   Signed URLs     │
          │  • Version        │          │                   │
          │  • Submodel       │          └───────────────────┘
          │  • Asset          │
          │  • Share          │
          │  • Visit          │
          │  • RefreshSession │
          └───────────────────┘
```

### Principios de Diseño

- **SOLID**: Separación clara de responsabilidades
  - Controllers → Services → Repositories → Adapters
  - Sin lógica de negocio en controllers
- **DRY**: No duplicación de código
  - Validaciones centralizadas
  - Middleware reutilizable
  - Componentes UI compartidos
- **KISS**: Simplicidad sin infraestructura innecesaria
  - Sin microservicios
  - Sin colas de procesamiento
  - Procesamiento directo en backend
- **YAGNI**: Features solo cuando son necesarias
  - Decisiones documentadas
  - Iteración incremental

---

## Instalación y Configuración

### Requisitos Previos
- Node.js 18+
- PostgreSQL 14+
- Cuenta AWS (S3 bucket configurado)
- Git

### 1. Clonar Repositorio
```bash
git clone <repo-url>
cd RV_CalderonArmani
```

### 2. Backend Setup
```bash
cd backend
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (ver sección Variables de Entorno)

# Ejecutar migraciones de base de datos
npx prisma migrate dev

# Generar cliente Prisma
npx prisma generate

# Iniciar servidor de desarrollo
npm run dev
```

El backend estará disponible en `http://localhost:4000`

### 3. Frontend Setup
```bash
cd ../frontend
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar NEXT_PUBLIC_API_URL

# Iniciar aplicación
npm run dev
```

El frontend estará disponible en `https://localhost:3000` (HTTPS en desarrollo)

---

### Variables de Entorno

#### Backend (`.env`)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/rv_calderon

# JWT
JWT_SECRET=<generar-string-aleatorio-64-caracteres>
JWT_ACCESS_TTL=900              # 15 minutos
JWT_REFRESH_TTL=2592000         # 30 días

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=rv-calderon-assets
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>

# Server
PORT=4000
NODE_ENV=development

# CORS
FRONTEND_URL=https://localhost:3000
```

#### Frontend (`.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## Estructura del Proyecto

```
RV_CalderonArmani/
├── backend/                      # Backend Express.js
│   ├── prisma/
│   │   └── schema.prisma         # Modelo de datos (13 entidades)
│   ├── src/
│   │   ├── modules/              # Módulos por dominio
│   │   │   ├── auth/             # Autenticación JWT
│   │   │   ├── projects/         # CRUD Projects
│   │   │   ├── products/         # CRUD Products
│   │   │   ├── versions/         # CRUD Versions
│   │   │   ├── submodels/        # CRUD Submodels (Fase 2)
│   │   │   ├── assets/           # Upload + Processing
│   │   │   ├── shares/           # Shares temporales
│   │   │   ├── visits/           # Tracking de visitas
│   │   │   ├── analytics/        # Dashboard analytics (Fase 2)
│   │   │   ├── public/           # Endpoints públicos
│   │   │   └── health/           # Health check
│   │   ├── common/               # Código compartido
│   │   │   ├── config/           # Validación de entorno
│   │   │   ├── errors/           # Error handling
│   │   │   ├── middleware/       # Auth, rate-limit, logging
│   │   │   ├── utils/            # Logger, utilities
│   │   │   └── validators/       # Validadores compartidos
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Cliente Prisma
│   │   │   └── storage.ts        # S3 operations
│   │   ├── app.ts                # Express setup
│   │   └── index.ts              # Entry point
│   ├── tests/                    # Unit tests
│   └── package.json
│
├── frontend/                     # Frontend Next.js
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   │   ├── (auth)/           # Login/Register
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (admin)/          # Panel administrativo
│   │   │   │   ├── dashboard/
│   │   │   │   ├── projects/
│   │   │   │   ├── analytics/    # Fase 2
│   │   │   │   └── visits/
│   │   │   └── experience/       # Viewer público
│   │   │       └── [token]/      # Experiencia AR/3D
│   │   ├── components/           # Componentes reutilizables
│   │   └── lib/
│   │       ├── api/              # Cliente REST
│   │       │   ├── client.ts     # HTTP client base
│   │       │   ├── auth.ts
│   │       │   ├── projects.ts
│   │       │   ├── products.ts
│   │       │   ├── versions.ts
│   │       │   ├── submodels.ts
│   │       │   ├── assets.ts
│   │       │   ├── shares.ts
│   │       │   ├── visits.ts
│   │       │   ├── analytics.ts
│   │       │   └── public.ts
│   │       └── auth/             # Auth context
│   └── package.json
│
└── development/                  # Documentación técnica (Source of Truth)
    ├── README.md                 # Índice y principios
    ├── phases/                   # Etapas de desarrollo
    │   ├── mvp.md                # Etapas 1-6 del MVP
    │   └── full.md               # Etapas 7-10 (Fase 2)
    ├── architecture/             # Arquitectura del sistema
    │   ├── system-architecture.md
    │   ├── ux-flows.md
    │   └── storage.md
    ├── api/
    │   └── api-spec.md           # Contrato REST completo
    ├── data/
    │   └── data-model.md         # Modelo de datos Prisma
    ├── diagrams/
    │   └── diagrams.mmd.md       # Diagramas Mermaid
    └── testing/
        └── testing-strategy.md   # Estrategia de testing
```

---

## Documentación Técnica

La documentación completa del sistema se encuentra en el directorio `development/`. Este directorio es la **Single Source of Truth** para arquitectura, API, datos y flujos.

### Documentos Principales

- **[Principios y Arquitectura](development/README.md)**: Índice general y principios obligatorios (SOLID, DRY, KISS, YAGNI)
- **[System Architecture](development/architecture/system-architecture.md)**: Arquitectura completa, flujos críticos y seguridad
- **[API Specification](development/api/api-spec.md)**: Contrato REST detallado (endpoints, DTOs, validaciones)
- **[Data Model](development/data/data-model.md)**: Esquema Prisma y reglas de integridad
- **[UX Flows](development/architecture/ux-flows.md)**: Especificación de pantallas y flujos de usuario
- **[Storage Policies](development/architecture/storage.md)**: Convenciones S3, signed URLs y cleanup
- **[MVP Phases](development/phases/mvp.md)**: Etapas 1-6 del desarrollo inicial
- **[Full Product](development/phases/full.md)**: Etapas 7-10 (Fase 2 - Submodels, Analytics)
- **[Testing Strategy](development/testing/testing-strategy.md)**: Normativa de testing, coverage y fixtures

---

## Testing

### Backend

```bash
cd backend

# Ejecutar todos los tests
npm test

# Ejecutar con coverage
npm test -- --coverage

# Ejecutar tests específicos
npm test -- assets.test.ts

# Watch mode
npm test -- --watch
```

**Unit tests implementados:**
- `env.test.ts` - Validación de configuración
- `auth.test.ts` - Login, refresh, logout
- `tenant-isolation.test.ts` - Cross-tenant protection
- `projects.test.ts`, `products.test.ts`, `versions.test.ts` - CRUD
- `assets.test.ts` - Upload, state machine, processing
- `shares.test.ts` - Expiración, revocación
- `visits.test.ts` - Start/end tracking
- `health.test.ts` - Health endpoint

**Cobertura mínima:**
- Global: 70%
- Services: 80%
- Validators: 100%

### Frontend

```bash
cd frontend

# Ejecutar tests
npm test

# Watch mode
npm test -- --watch
```

**Tests implementados:**
- `login.test.tsx` - Smoke test de página de login

---

## Deploy

### Backend (AWS Amplify)

1. **Configurar RDS PostgreSQL**:
   - Crear instancia PostgreSQL en AWS RDS
   - Configurar security group para acceso desde Amplify
   - Anotar `DATABASE_URL`

2. **Configurar S3 Bucket**:
   ```bash
   # Crear bucket privado
   aws s3api create-bucket --bucket rv-calderon-assets --region us-east-1

   # Bloquear acceso público
   aws s3api put-public-access-block \
     --bucket rv-calderon-assets \
     --public-access-block-configuration \
     BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

   # Configurar CORS (ver development/architecture/storage.md)
   aws s3api put-bucket-cors --bucket rv-calderon-assets --cors-configuration file://cors.json
   ```

3. **Deploy en Amplify**:
   - Conectar repositorio a AWS Amplify
   - Configurar build settings para Node.js
   - Agregar variables de entorno en Amplify Console:
     - `DATABASE_URL`
     - `JWT_SECRET`
     - `AWS_S3_BUCKET`
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `FRONTEND_URL`

### Frontend (AWS Amplify)

1. **Configurar Amplify App**:
   - Crear nueva app en AWS Amplify
   - Conectar repositorio Git
   - Seleccionar carpeta `frontend/`

2. **Build Settings** (`amplify.yml`):
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - cd frontend
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: frontend/.next
       files:
         - '**/*'
     cache:
       paths:
         - frontend/node_modules/**/*
   ```

3. **Variables de Entorno**:
   - `NEXT_PUBLIC_API_URL`: URL del backend en Amplify

4. **Deploy**:
   - Commit a rama principal
   - Amplify ejecutará build automáticamente

---

## Roadmap

### Fase 1 (MVP) ✅ COMPLETADA

- [x] Auth multi-tenant con JWT (access + refresh tokens)
- [x] CRUD completo Projects/Products/Versions
- [x] Upload GLB con procesamiento (validación, thumbnails, USDZ)
- [x] Viewer 3D con Babylon.js
- [x] WebXR AR para Android
- [x] iOS Quick Look con USDZ
- [x] Shares temporales con seguridad (expiración, límite de visitas)
- [x] Visit tracking (duración, uso de AR, device info)

### Fase 2 (Features Avanzadas) ✅ COMPLETADA

- [x] Submodelos y variantes de productos
- [x] Analytics dashboard con filtros y visualización
- [x] Hardening de seguridad (rate limiting, validaciones estrictas)
- [x] Controles AR avanzados:
  - [x] Joystick de movimiento (0.8 m/s)
  - [x] Slider de rotación (0-360°)
  - [x] Bottom sheet minimizable
- [x] Swap de submodelos preservando estado AR
- [x] Loading states mejorados
- [x] Ampliación de límite de archivos a 500MB

### Futuras Mejoras (Fase 3)

- [ ] Optimización automática de GLB (Draco compression)
- [ ] WebSockets para analytics en tiempo real
- [ ] Export de analytics a CSV
- [ ] Multi-user permissions (roles avanzados: VIEWER, EDITOR)
- [ ] Editor de escenas 3D integrado
- [ ] Hotspots interactivos en modelos 3D
- [ ] Anotaciones en AR
- [ ] Colaboración en tiempo real (multi-usuario en AR)
- [ ] Integración con CRM (Salesforce, HubSpot)

---

## Contribución

Este es un proyecto académico privado. Para contribuir, contactar al equipo de desarrollo.

---

## Licencia

Propietario. Todos los derechos reservados.

---

## Contacto

Proyecto desarrollado como entrega académica.

Para consultas sobre el proyecto, contactar a través del repositorio.

---

## Agradecimientos

Construido con tecnologías open-source de clase mundial:

- [Babylon.js](https://www.babylonjs.com/) - Motor 3D/WebXR
- [Next.js](https://nextjs.org/) - Framework React
- [Prisma](https://www.prisma.io/) - ORM TypeScript
- [Express](https://expressjs.com/) - Framework Node.js
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [AWS](https://aws.amazon.com/) - Cloud infrastructure

---

## Estado del Proyecto

**Versión actual**: MVP + Fase 2 (Completa)

**Última actualización**: Febrero 2026

**Branches**:
- `main`: Producción estable
- `develop`: Desarrollo activo

**Commits recientes**:
- `f3e08fe` - 8/init
- `a473786` - 7/ init
- `3593f80` - 6/ arreglo joystick
- `7990ee6` - 6/ mejoras ui AR
- `24bd593` - 6/ mejora visual
