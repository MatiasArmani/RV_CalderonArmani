~~~md
# Fase 2 — Completo
Extiende el MVP manteniendo **KISS/YAGNI** y sin introducir arquitectura innecesaria.

---

## Objetivo Fase 2
1) Submodelos / Variantes (por Version)  
2) Analíticas avanzadas (dashboard + filtros)  
3) Hardening (seguridad + validaciones + performance UX)  
4) Mejoras de experiencia (usabilidad, estabilidad mobile)  

---

## Etapa 7 — Submodelos / Variantes

### Implementación
- Nueva entidad `Submodel`:
  - pertenece a `Version`
  - permite representar variantes (color, configuración) o componentes
- Relación con assets:
  - opción A (simple): Asset opcionalmente se asocia a `submodelId`
  - opción B (más compleja): overrides sobre asset base (evitar en Fase 2 si no es necesario)

### Entregables
- Admin puede crear/editar/eliminar submodelos
- Viewer muestra selector (dropdown/cards)
- Cambiar submodelo actualiza el asset cargado de forma estable

### Unit tests esenciales
- Submodel CRUD (tenant enforced)
- No permite crear Submodel en Version de otro tenant
- Public experience devuelve submodelos disponibles (si se habilita públicamente)

### QA Checklist
- Selector claro y sin confusión
- Swap de modelo no rompe viewer (fallback si falla carga)
- Estado de carga visible

### Implementación Completada ✅

- Tabla `Submodel` en Prisma schema con relación a `Version`
- API REST completa (GET, POST, PATCH, DELETE) en `/api/versions/:versionId/submodels` y `/api/submodels/:id`
- Upload de assets por submodelo (mismo flujo que Version, opcionalmente asociados a `submodelId`)
- Frontend admin: CRUD completo en panel de versión
- Public viewer: Selector horizontal de variantes con swap en vivo sin perder estado AR
- Preservación de posición y rotación al cambiar submodelo en AR
- Funciona en AR (WebXR) y Viewer-fallback (Babylon orbit)
- Re-fit automático de cámara en viewer al cambiar modelo
- Loading states durante swap de modelo

---

## Etapa 8 — Analíticas avanzadas (Dashboard)

### Implementación
- Dashboard por tenant:
  - visits por día
  - top products/versions
  - duración promedio
  - tasa AR (usedAR)
  - breakdown básico por device (mobile vs desktop)
- Filtros por rango de fechas
- Export CSV: solo si aporta valor real (YAGNI)

### Entregables
- Pantalla analytics usable en admin
- Endpoints agregados en `/api/analytics/*` (definirlos en `api-spec.md`)

### Unit tests esenciales
- Queries agregadas:
  - filtran por companyId
  - respetan rango de fechas
- Autorización:
  - sólo ADMIN (o rol habilitado)
- No leakage cross-tenant

### QA Checklist
- Performance OK con índices
- Resultados consistentes con tabla Visit

### Implementación Completada ✅

- Dashboard analytics en `/analytics` con interfaz completa
- Filtros de fecha con presets (7 días, 30 días, 90 días) y rango personalizado (date pickers)
- KPI Cards:
  - Total visitas
  - Links activos (shares con visitas)
  - Duración promedio (formato m:s)
  - Tasa AR (porcentaje de visitas que usaron AR)
- Gráfico de barras SVG mostrando visitas por día
- Device breakdown: Mobile vs Desktop con porcentaje y barras visuales
- Top productos: Lista ordenada por visitCount con barras de progreso
- Backend endpoint `GET /api/analytics/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Agregaciones SQL eficientes con filtrado por `companyId`
- Link a `/visits` para ver detalle completo de visitas

---

## Etapa 9 — Hardening de seguridad y calidad

### Implementación
- Seguridad:
  - headers (helmet)
  - CORS restrictivo
  - rate limit afinado en endpoints críticos (auth, shares, public)
  - validación estricta de payloads
  - opcional: anti-bot si hay abuso real
- Calidad:
  - estandarizar errores y códigos
  - auditoría mínima (opcional): log de acciones ADMIN

### Entregables
- Sistema más resistente a abuso
- Contratos API más estrictos y consistentes

### Unit tests esenciales
- Rate limiting activa en endpoints definidos
- Validación payload:
  - rechaza campos extra si se define strict mode
- Seguridad:
  - endpoints privados requieren auth siempre
  - public experience no expone datos internos

### QA Checklist
- No regresa funcionalidad MVP
- Errores se muestran correctamente en frontend
- No rompe AR / viewer

---

## Etapa 10 — Performance UX (Viewer y assets)

### Implementación
- Mejoras viewer:
  - optimizaciones Babylon (settings, lower post-processing)
  - manejo de dispositivos de baja gama (fallback quality)
- Límites y feedback:
  - tamaño máximo de asset
  - warnings si excede thresholds
- Si USDZ no entró en MVP:
  - incorporarlo aquí con el mínimo de complejidad posible

### Entregables
- Experiencia más fluida en mobile
- Feedback al usuario cuando el modelo es demasiado pesado

### Unit tests esenciales
- (Backend) límites de tamaño aplican consistentemente
- (Frontend) fallback quality no rompe render

### QA Checklist
- Tiempo de carga razonable
- Sin crashes en mobile
- UI de carga/error clara

---

## Criterios de aceptación Full
- Submodelos funcionales y estables
- Dashboard analytics completo para decisiones
- Seguridad reforzada sin fricción excesiva
- Viewer más estable y rápido
- Documentación actualizada (API/Datos/Flujos) por cada cambio

---

## Estado de Implementación Fase 2

✅ **Etapa 7** - Submodelos/Variantes (COMPLETADA)
✅ **Etapa 8** - Analytics Dashboard (COMPLETADA)
🔄 **Etapa 9** - Hardening de Seguridad (EN PROGRESO)
  - Rate limiting implementado en todos los endpoints
  - CORS restrictivo configurado
  - Helmet headers aplicados
  - Validaciones de payload estrictas
  - Pendiente: Auditoría completa de logs

🔄 **Etapa 10** - Performance UX (PARCIALMENTE COMPLETADA)
  - USDZ conversion implementada
  - Viewer optimizado para mobile
  - Límite de archivos ampliado a 500MB con timeout de 30 min
  - Pendiente: Optimización automática de GLB (Draco compression opcional)

---

## Mejoras Adicionales Implementadas (No Planificadas)

Durante el desarrollo se implementaron features adicionales para mejorar la experiencia AR:

✅ **Joystick de movimiento en AR**
  - Velocidad: 0.8 m/s a máximo desplazamiento
  - Control táctil y mouse
  - Loop requestAnimationFrame para movimiento suave
  - Restricción a plano XZ (altura fija)

✅ **Control de rotación con slider**
  - Rango: 0-360°
  - Actualización en tiempo real del modelo
  - Indicador visual del ángulo actual

✅ **Bottom sheet minimizable en AR**
  - Drag handle para minimizar/expandir
  - Floating button cuando está minimizado
  - Animaciones suaves slide-up/slide-down

✅ **Swap de submodelos preservando estado AR**
  - Mantiene posición (x, y, z) al cambiar modelo
  - Mantiene rotación (y-axis)
  - Loading state durante descarga
  - Fallback silencioso en caso de error

✅ **Loading states mejorados en AR**
  - Modelo descarga en background mientras usuario escanea
  - Instrucciones contextuales adaptativas
  - Feedback visual durante procesamiento
  - Timeout handling robusto
```