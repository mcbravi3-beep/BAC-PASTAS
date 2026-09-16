# Sistema de Gestion Integral - Fabrica de Pastas Caseras

Sistema web para reemplazar el Excel de costeo, stock, ventas y resultados de
la fabrica, manteniendo todas las reglas de negocio ya definidas: costeo por
lote (Costeo_Estandar) con respaldo por receta (Recetas_BOM), descuento
automatico de insumos al producir, stock de insumos y de productos
terminados, ventas por ticket con margen automatico, cuenta corriente de
clientes, resultados mensuales y alertas de stock.

## Datos de arranque: migrados desde `sistema_gestion_pastas.xlsx`

Los datos iniciales (`src/seed.js`) se migraron 1:1 desde el Excel real
adjuntado (hoja `Diccionario_Variables` + hojas operativas), no son
inventados. Segun lo que el propio archivo marca:

- **Catalogo de 23 productos** (hoja `Productos`): real.
- **Ficha de Costeo_Estandar de "Ravioles - Verdura y carne" (P001)**: real,
  aportada por el negocio (asi calcula Meri su costo real: 100 porciones por
  lote, insumos de masa $12.000, insumos de relleno $95.000, mano de obra
  segun horas x 2 personas x $7.000/hora).
- Proveedores (6), Insumos (10, con sus costos y stock minimo), Clientes (4),
  la receta BOM de P001 y de "Sorrentinos Jamon y queso" (P005), y los
  movimientos de Ventas / Produccion / Inventario_Insumos ya cargados en el
  Excel: la propia hoja los marca como "de ejemplo" para mostrar el
  mecanismo de costeo. Se migraron igual, tal cual estaban, para no perder
  ese trabajo de carga y prueba -- y porque permiten verificar que el
  sistema nuevo reproduce exactamente los mismos numeros que el Excel
  (stock de insumos, stock de productos terminados y resultados mensuales
  coinciden con lo que muestran `Insumos.Stock_Actual`, `Stock_PT` y
  `Resultados_PL` en el archivo original).
- **Los otros 21 productos todavia no tienen ficha de costo ni precio de
  venta cargado en el Excel** (columnas en blanco). Quedan asi a proposito:
  se completan desde **Costeo Estandar** / **Recetas (BOM)** y **Productos**
  a medida que el negocio tenga esos datos. Mientras un producto no tenga
  precio de venta, el formulario de ventas no deja cargar cantidad para el
  (para no emitir tickets con total $0 por error).

Para volver a cargar estos datos de cero (por ejemplo si se edita
`src/seed.js`): parar el servidor y borrar `data/pastas.db`.

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

## Modelo de datos

Tablas (ver `src/schema.sql`): `proveedores`, `insumos`, `productos`,
`costeo_estandar`, `recetas_bom`, `clientes`, `tickets`, `ventas`,
`produccion`, `inventario_insumos`, `gastos_fijos`,
`cuenta_corriente_movimientos`. El stock de insumos y de productos
terminados no se guarda como columna: se calcula siempre a partir de los
movimientos (`inventario_insumos`, `produccion`, `ventas`), para que nunca
quede desincronizado. Lo mismo con el saldo de cuenta corriente de un
cliente: se calcula (cargos - pagos) en vez de guardarse.

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
- **Ticket de venta**: el formulario de Ventas es una sola pantalla con la
  cantidad a vender de cada producto (estilo punto de venta). Al emitirlo se
  crea un comprobante interno "Ticket X" (no es una factura) con el detalle
  y el total, y se generan las lineas de venta correspondientes con
  subtotal, costo (al costo unitario vigente) y margen calculados
  automaticamente. El ticket tiene dos formas de pago:
  - **Contado** (pago inmediato: efectivo / transferencia / tarjeta).
  - **Cuenta corriente** (pago diferido): requiere cliente, y genera
    automaticamente un cargo por el total del ticket en el modulo
    **Deudores**.
- **Deudores / Cuenta corriente**: el saldo de cada cliente = suma de cargos
  (tickets a cuenta corriente) - suma de pagos registrados. Desde la
  pantalla de Deudores se ve el saldo de cada cliente, su historial de
  cargos/pagos, y se puede registrar un pago (cobro) que reduce el saldo.
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
- **Ventas**: formulario de ticket -- cargar cantidades, elegir cliente y
  forma de pago (contado / cuenta corriente), emitir e imprimir el ticket;
  debajo, el historial de tickets emitidos con opcion de volver a verlos.
- **Deudores (Cta. Cte.)**: clientes con saldo, historial de movimientos y
  registro de pagos.
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
`produccion`, `inventario_insumos`, `gastos_fijos`, `tickets`,
`cuenta_corriente_movimientos`). El CSV exporta las columnas tal cual estan
en la base; el stock actual y el costo calculado de cada insumo/producto se
ven en pantalla y se pueden copiar desde ahi si se necesitan en la planilla.

## API

Todos los endpoints estan bajo `/api`. Recursos CRUD estandar (`GET`,
`GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`): `proveedores`, `clientes`,
`insumos`, `productos`, `costeo-estandar` (por `producto_id`, hace upsert),
`recetas-bom`, `gastos-fijos`. Endpoints de negocio: `POST /produccion`,
`POST /ventas` (una sola linea), `POST /tickets` (un ticket con una o varias
lineas -- lo que usa la pantalla de Ventas), `GET /tickets`,
`GET /tickets/:id`, `GET /deudores`, `GET /deudores/:clienteId/movimientos`,
`POST /deudores/pagos`, `GET/POST /inventario-insumos`,
`GET /resultados?anio=&mes=`, `GET /alertas`, `GET /export/:tabla`.
