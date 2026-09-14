# Sistema de Gestion Integral - Fabrica de Pastas Caseras

Sistema web para reemplazar el Excel de costeo, stock, ventas y resultados de
la fabrica, manteniendo todas las reglas de negocio ya definidas: costeo por
lote (Costeo_Estandar) con respaldo por receta (Recetas_BOM), descuento
automatico de insumos al producir, stock de insumos y de productos
terminados, ventas con margen automatico, resultados mensuales y alertas de
stock.

## Nota importante sobre los datos de arranque

El archivo `sistema_gestion_pastas.xlsx` mencionado en la consigna **no llego
adjunto a esta sesion** (no hay ningun archivo Excel en el repositorio ni en
el entorno de trabajo). Por eso los datos de arranque (proveedores, insumos,
23 productos, clientes y la ficha de costeo de "Ravioles - Verdura y Carne")
son **ilustrativos**, incluido ese ultimo dato que segun la consigna deberia
ser real. En cuanto se pueda compartir el Excel (o los numeros reales) hay
que reemplazar esos valores desde las pantallas de **Insumos**, **Productos**
y **Costeo Estandar** -- o editando `src/seed.js` y regenerando la base
(borrando `data/pastas.db`) si se prefiere arrancar de cero con los datos
correctos.

## Stack

- Backend: Node.js + Express, sin frameworks pesados.
- Base de datos: SQLite embebida usando el modulo nativo `node:sqlite` de
  Node 22 (no requiere compilar dependencias nativas ni instalar un motor de
  base de datos aparte). El archivo vive en `data/pastas.db`.
- Frontend: HTML + JS vanilla (sin build step), servido como archivos
  estaticos por el mismo servidor Express.

## Como correrlo

```bash
npm install
npm start
```

Abrir `http://localhost:3000`. La primera vez que arranca, si la base esta
vacia, se cargan automaticamente los datos iniciales (`src/seed.js`).

Para desarrollo con reinicio automatico: `npm run dev`.

Para empezar de cero (borra todos los datos cargados y vuelve a poner los de
arranque): parar el servidor y borrar `data/pastas.db`.

## Modelo de datos

Tablas (ver `src/schema.sql`): `proveedores`, `insumos`, `productos`,
`costeo_estandar`, `recetas_bom`, `clientes`, `ventas`, `produccion`,
`inventario_insumos`, `gastos_fijos`. El stock de insumos y de productos
terminados no se guarda como columna: se calcula siempre a partir de los
movimientos (`inventario_insumos`, `produccion`, `ventas`), para que nunca
quede desincronizado.

## Reglas de negocio implementadas (`src/costeo.js`)

- **Costo unitario de un producto**: si el producto tiene ficha en
  `Costeo_Estandar`, el costo sale de ahi: `(costo insumos masa + costo
  insumos relleno + costo mano de obra) / porciones por lote`, donde el costo
  de mano de obra es `(horas armado + horas masa + horas relleno + horas
  empaquetado) x personas x costo de la hora`. Si no hay ficha, se calcula
  sumando `Recetas_BOM` (cantidad por unidad x costo del insumo).
- **Produccion**: al registrar un lote se calcula su costo y, si el producto
  tiene receta cargada en `Recetas_BOM`, se generan automaticamente los
  movimientos de salida de insumos correspondientes (cantidad de la receta x
  cantidad producida). Esto es automatico aunque el producto se costee por
  ficha estandar -- por eso conviene cargar la receta BOM de todos modos,
  aunque solo sea para el descuento de stock.
- **Ventas**: al registrar una venta se calculan subtotal, costo (al costo
  unitario vigente en ese momento) y margen automaticamente.
- **Stock de insumos**: entradas menos salidas registradas en
  `inventario_insumos`.
- **Stock de productos terminados**: stock inicial + producido - vendido.
- **Resultados mensuales**: ventas totales, costo de mercaderia vendida,
  margen bruto, margen %, gastos fijos (carga manual por mes) y resultado
  neto.
- **Alertas**: insumos por debajo de su stock minimo y productos terminados
  por debajo de su stock minimo, visibles en el Dashboard.

## Pantallas

- **Dashboard**: resultado del mes (con selector de periodo) y alertas de
  stock.
- **Produccion**: registrar lotes producidos (descuenta insumos solo).
- **Ventas**: registrar ventas (calcula subtotal/costo/margen solo).
- **Movimientos de Insumos**: compras, ajustes y mermas manuales (las
  salidas por produccion se generan solas, no se cargan a mano).
- **Productos / Insumos / Proveedores / Clientes**: ABM con stock, costo y
  margen calculados en la tabla.
- **Costeo Estandar**: alta/edicion de la ficha de costo por lote de cada
  producto.
- **Recetas (BOM)**: alta/edicion de la receta insumo por insumo de cada
  producto.
- **Gastos Fijos**: carga manual mensual (alquiler, servicios, sueldos,
  etc.) para el calculo del resultado neto.

Cada pantalla de catalogo/operaciones tiene un boton **Exportar CSV** que
descarga la tabla completa. Tambien se puede pedir cualquier tabla
directamente via `GET /api/export/:tabla` (`proveedores`, `insumos`,
`productos`, `costeo_estandar`, `recetas_bom`, `clientes`, `ventas`,
`produccion`, `inventario_insumos`, `gastos_fijos`). El CSV exporta las
columnas tal cual estan en la base; el stock actual y el costo calculado de
cada insumo/producto se ven en pantalla y se pueden copiar desde ahi si se
necesitan en la planilla.

## API

Todos los endpoints estan bajo `/api`. Recursos CRUD estandar (`GET`,
`GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`): `proveedores`, `clientes`,
`insumos`, `productos`, `costeo-estandar` (por `producto_id`, hace upsert),
`recetas-bom`, `gastos-fijos`. Endpoints de negocio: `POST /produccion`,
`POST /ventas`, `GET/POST /inventario-insumos`, `GET /resultados?anio=&mes=`,
`GET /alertas`, `GET /export/:tabla`.
