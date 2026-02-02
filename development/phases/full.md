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
```