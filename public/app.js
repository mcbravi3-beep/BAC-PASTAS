// Sistema de Gestion - Fabrica de Pastas Caseras - Frontend (vanilla JS)

const api = {
  async get(path) {
    const r = await fetch(`/api/${path}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error');
    return r.json();
  },
  async send(method, path, body) {
    const r = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error');
    return r.status === 204 ? null : r.json();
  },
  post(path, body) { return this.send('POST', path, body); },
  put(path, body) { return this.send('PUT', path, body); },
  async del(path) {
    const r = await fetch(`/api/${path}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error');
  },
};

const money = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- Generic CRUD section ----------
async function renderCrud(container, cfg) {
  container.innerHTML = `<h2>${cfg.title}</h2><div id="crud-body"></div>`;
  const body = container.querySelector('#crud-body');
  const refs = {};
  if (cfg.refs) {
    for (const r of cfg.refs) refs[r.name] = await api.get(r.api);
  }

  async function load() {
    const rows = await api.get(cfg.api);
    body.innerHTML = '';
    body.appendChild(buildForm());
    body.appendChild(buildTable(rows));
  }

  function optionsFor(field) {
    const list = refs[field.ref];
    return `<option value="">-</option>` + list.map((r) => `<option value="${r.id}">${r.label ? field.optionLabel(r) : field.optionLabel(r)}</option>`).join('');
  }

  function buildForm(editRow) {
    const form = el(`<form class="inline-form"></form>`);
    for (const f of cfg.fields) {
      const wrap = document.createElement('label');
      wrap.textContent = f.label;
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        input.innerHTML = optionsFor(f);
      } else if (f.type === 'options') {
        input = document.createElement('select');
        input.innerHTML = f.options.map((o) => `<option value="${o}">${o}</option>`).join('');
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        if (f.step) input.step = f.step;
      }
      input.name = f.key;
      if (editRow && editRow[f.key] !== undefined && editRow[f.key] !== null) input.value = editRow[f.key];
      wrap.appendChild(input);
      form.appendChild(wrap);
    }
    const submit = el(`<button type="submit">${editRow ? 'Guardar cambios' : 'Agregar'}</button>`);
    form.appendChild(submit);
    if (editRow) {
      const cancel = el(`<button type="button" class="secondary">Cancelar</button>`);
      cancel.onclick = () => load();
      form.appendChild(cancel);
    }
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = {};
      for (const f of cfg.fields) {
        const raw = form.elements[f.key].value;
        data[f.key] = f.type === 'number' ? (raw === '' ? 0 : Number(raw)) : (raw === '' ? null : raw);
      }
      try {
        if (editRow) await api.put(`${cfg.api}/${editRow.id}`, data);
        else await api.post(cfg.api, data);
        load();
      } catch (err) {
        alert(err.message);
      }
    };
    return form;
  }

  function buildTable(rows) {
    if (rows.length === 0) return el(`<p class="empty">Sin registros todavia.</p>`);
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr>${cfg.columns.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = cfg.columns.map((c) => `<td>${c.render ? c.render(row) : (row[c.key] ?? '')}</td>`).join('');
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions-cell';
      const editBtn = el(`<button class="secondary">Editar</button>`);
      editBtn.onclick = () => {
        body.innerHTML = '';
        body.appendChild(buildForm(row));
        body.appendChild(buildTable(rows));
      };
      const delBtn = el(`<button class="danger">Eliminar</button>`);
      delBtn.onclick = async () => {
        if (!confirm('Eliminar este registro?')) return;
        try { await api.del(`${cfg.api}/${row.id}`); load(); } catch (err) { alert(err.message); }
      };
      actionsTd.append(editBtn, delBtn);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  load();
}

// ---------- Section configs ----------
const sections = {
  proveedores: {
    title: 'Proveedores', api: 'proveedores',
    fields: [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'contacto', label: 'Contacto' },
      { key: 'condicion_pago', label: 'Condicion de pago' },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' }, { key: 'contacto', label: 'Contacto' }, { key: 'condicion_pago', label: 'Cond. pago' },
    ],
  },
  clientes: {
    title: 'Clientes', api: 'clientes',
    fields: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'tipo', label: 'Tipo', type: 'options', options: ['particular', 'mayorista', 'revendedor'] },
      { key: 'contacto', label: 'Contacto' },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' }, { key: 'tipo', label: 'Tipo' }, { key: 'contacto', label: 'Contacto' },
      { label: 'Total comprado', render: (r) => money(r.totalComprado) },
    ],
  },
  insumos: {
    title: 'Insumos', api: 'insumos',
    refs: [{ name: 'proveedor_id', api: 'proveedores' }],
    fields: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'unidad', label: 'Unidad' },
      { key: 'costo_unitario', label: 'Costo unitario', type: 'number', step: '0.01' },
      { key: 'proveedor_id', label: 'Proveedor', type: 'select', ref: 'proveedor_id', optionLabel: (r) => r.nombre },
      { key: 'stock_minimo', label: 'Stock minimo', type: 'number', step: '0.01' },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' }, { key: 'unidad', label: 'Unidad' },
      { label: 'Costo unit.', render: (r) => money(r.costo_unitario) },
      { key: 'proveedor_nombre', label: 'Proveedor' },
      { label: 'Stock actual', render: (r) => `${num(r.stockActual)} ${r.unidad}` },
      { key: 'stock_minimo', label: 'Stock min.' },
      { label: 'Estado', render: (r) => r.alertaStock ? '<span class="badge warn">Bajo stock</span>' : '<span class="badge ok">OK</span>' },
    ],
  },
  productos: {
    title: 'Productos', api: 'productos',
    fields: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'precio_venta', label: 'Precio venta', type: 'number', step: '0.01' },
      { key: 'stock_inicial', label: 'Stock inicial', type: 'number', step: '0.01' },
      { key: 'stock_minimo', label: 'Stock minimo', type: 'number', step: '0.01' },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' }, { key: 'categoria', label: 'Categoria' },
      { label: 'Costo unit.', render: (r) => `${money(r.costoUnitario)} <span class="note">(${r.origenCosteo})</span>` },
      { label: 'Precio venta', render: (r) => money(r.precio_venta) },
      { label: 'Margen', render: (r) => money(r.margen) },
      { label: 'Stock', render: (r) => num(r.stockActual) },
      { label: 'Estado', render: (r) => r.alertaStock ? '<span class="badge warn">Bajo stock</span>' : '<span class="badge ok">OK</span>' },
    ],
  },
  gastos: {
    title: 'Gastos Fijos (mensuales)', api: 'gastos-fijos',
    fields: [
      { key: 'anio', label: 'Anio', type: 'number' },
      { key: 'mes', label: 'Mes (1-12)', type: 'number' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'monto', label: 'Monto', type: 'number', step: '0.01' },
    ],
    columns: [
      { key: 'anio', label: 'Anio' }, { key: 'mes', label: 'Mes' }, { key: 'concepto', label: 'Concepto' },
      { label: 'Monto', render: (r) => money(r.monto) },
    ],
  },
};

// ---------- Dashboard ----------
async function renderDashboard(container) {
  const now = new Date();
  let anio = now.getFullYear(), mes = now.getMonth() + 1;

  async function paint() {
    const [resultado, alertas] = await Promise.all([
      api.get(`resultados?anio=${anio}&mes=${mes}`),
      api.get('alertas'),
    ]);
    container.innerHTML = `
      <h2>Dashboard</h2>
      <div class="toolbar">
        <label>Periodo:
          <select id="mes-sel"></select>
        </label>
      </div>
      <div class="card">
        <h3>Resultado del mes</h3>
        <div class="grid">
          <div class="stat"><div class="label">Ventas totales</div><div class="value">${money(resultado.ventasTotales)}</div></div>
          <div class="stat"><div class="label">Costo mercaderia vendida</div><div class="value">${money(resultado.costoMercaderia)}</div></div>
          <div class="stat"><div class="label">Margen bruto</div><div class="value">${money(resultado.margenBruto)}</div></div>
          <div class="stat"><div class="label">Margen %</div><div class="value">${resultado.margenPct.toFixed(1)}%</div></div>
          <div class="stat"><div class="label">Gastos fijos</div><div class="value">${money(resultado.gastosFijos)}</div></div>
          <div class="stat"><div class="label">Resultado neto</div><div class="value">${money(resultado.resultadoNeto)}</div></div>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <h3>Alertas de insumos (stock bajo minimo)</h3>
          ${alertas.insumos.length === 0 ? '<p class="empty">Sin alertas.</p>' : `<ul class="alert-list">${alertas.insumos.map((i) => `<li>⚠️ <strong>${i.nombre}</strong>: ${num(i.stockActual)} ${i.unidad} (minimo ${num(i.stock_minimo)})</li>`).join('')}</ul>`}
        </div>
        <div class="card">
          <h3>Alertas de productos terminados (stock bajo)</h3>
          ${alertas.productos.length === 0 ? '<p class="empty">Sin alertas.</p>' : `<ul class="alert-list">${alertas.productos.map((p) => `<li>⚠️ <strong>${p.nombre}</strong>: ${num(p.stockActual)} unidades (minimo ${num(p.stock_minimo)})</li>`).join('')}</ul>`}
        </div>
      </div>
    `;
    const sel = container.querySelector('#mes-sel');
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(`<option value="${d.getFullYear()}-${d.getMonth() + 1}" ${d.getFullYear() === anio && d.getMonth() + 1 === mes ? 'selected' : ''}>${d.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}</option>`);
    }
    sel.innerHTML = opts.join('');
    sel.onchange = () => { [anio, mes] = sel.value.split('-').map(Number); paint(); };
  }
  paint();
}

// ---------- Produccion ----------
async function renderProduccion(container) {
  const productos = await api.get('productos');
  async function load(msgHtml = '') {
    const rows = await api.get('produccion');
    container.innerHTML = `
      <h2>Produccion</h2>
      <p class="note">Al registrar una produccion se calcula el costo (ficha estandar o receta BOM) y se descuentan automaticamente los insumos usados segun la receta.</p>
      <form class="inline-form" id="form-prod">
        <label>Producto <select name="producto_id">${productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('')}</select></label>
        <label>Cantidad <input name="cantidad" type="number" step="0.01" required></label>
        <label>Fecha <input name="fecha" type="date" value="${todayISO()}"></label>
        <button type="submit">Registrar produccion</button>
      </form>
      <div id="prod-msg">${msgHtml}</div>
      <table><thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Costo unit.</th><th>Costo total</th><th>Origen costeo</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.fecha}</td><td>${r.producto_nombre}</td><td>${num(r.cantidad)}</td><td>${money(r.costo_unitario)}</td><td>${money(r.costo_total)}</td><td>${r.origen_costeo}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin producciones todavia.</td></tr>'}</tbody></table>
    `;
    container.querySelector('#form-prod').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const result = await api.post('produccion', {
          producto_id: Number(f.producto_id.value),
          cantidad: Number(f.cantidad.value),
          fecha: f.fecha.value,
        });
        load(`<p class="result-msg ok">Produccion registrada. Costo total: ${money(result.costoTotal)} (costo unitario ${money(result.costoUnitario)}, metodo: ${result.origen}). Insumos descontados automaticamente.</p>`);
      } catch (err) {
        load(`<p class="result-msg error">${err.message}</p>`);
      }
    };
  }
  load();
}

// ---------- Ventas ----------
async function renderVentas(container) {
  const [productos, clientes] = await Promise.all([api.get('productos'), api.get('clientes')]);
  async function load(msgHtml = '') {
    const rows = await api.get('ventas');
    container.innerHTML = `
      <h2>Ventas</h2>
      <form class="inline-form" id="form-venta">
        <label>Producto <select name="producto_id">${productos.map((p) => `<option value="${p.id}" data-precio="${p.precio_venta}">${p.nombre}</option>`).join('')}</select></label>
        <label>Cliente <select name="cliente_id"><option value="">-</option>${clientes.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('')}</select></label>
        <label>Cantidad <input name="cantidad" type="number" step="0.01" required></label>
        <label>Precio unitario <input name="precio_unitario" type="number" step="0.01"></label>
        <label>Forma de pago <select name="forma_pago"><option>efectivo</option><option>transferencia</option><option>tarjeta</option></select></label>
        <label>Fecha <input name="fecha" type="date" value="${todayISO()}"></label>
        <button type="submit">Registrar venta</button>
      </form>
      <div id="venta-msg">${msgHtml}</div>
      <table><thead><tr><th>Fecha</th><th>Producto</th><th>Cliente</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th><th>Costo</th><th>Margen</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.fecha}</td><td>${r.producto_nombre}</td><td>${r.cliente_nombre || '-'}</td><td>${num(r.cantidad)}</td><td>${money(r.precio_unitario)}</td><td>${money(r.subtotal)}</td><td>${money(r.costo_total)}</td><td>${money(r.margen)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin ventas todavia.</td></tr>'}</tbody></table>
    `;
    const form = container.querySelector('#form-venta');
    const precioInput = form.elements.precio_unitario;
    const productoSel = form.elements.producto_id;
    productoSel.onchange = () => { precioInput.placeholder = productoSel.selectedOptions[0].dataset.precio; };
    productoSel.dispatchEvent(new Event('change'));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const result = await api.post('ventas', {
          producto_id: Number(f.producto_id.value),
          cliente_id: f.cliente_id.value ? Number(f.cliente_id.value) : null,
          cantidad: Number(f.cantidad.value),
          precio_unitario: f.precio_unitario.value ? Number(f.precio_unitario.value) : undefined,
          forma_pago: f.forma_pago.value,
          fecha: f.fecha.value,
        });
        load(`<p class="result-msg ok">Venta registrada. Subtotal ${money(result.subtotal)}, costo ${money(result.costoTotal)}, margen ${money(result.margen)}.</p>`);
      } catch (err) {
        load(`<p class="result-msg error">${err.message}</p>`);
      }
    };
  }
  load();
}

// ---------- Inventario de insumos ----------
async function renderInventario(container) {
  const insumos = await api.get('insumos');
  async function load(msgHtml = '') {
    const rows = await api.get('inventario-insumos');
    container.innerHTML = `
      <h2>Movimientos de Insumos</h2>
      <p class="note">Las salidas por produccion se generan automaticamente. Aca se cargan compras, ajustes y mermas.</p>
      <form class="inline-form" id="form-mov">
        <label>Insumo <select name="insumo_id">${insumos.map((i) => `<option value="${i.id}">${i.nombre} (${i.unidad})</option>`).join('')}</select></label>
        <label>Tipo <select name="tipo"><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>
        <label>Motivo <select name="motivo"><option value="compra">Compra</option><option value="ajuste">Ajuste</option><option value="merma">Merma</option></select></label>
        <label>Cantidad <input name="cantidad" type="number" step="0.01" required></label>
        <label>Referencia <input name="referencia" type="text"></label>
        <label>Fecha <input name="fecha" type="date" value="${todayISO()}"></label>
        <button type="submit">Registrar movimiento</button>
      </form>
      <div id="mov-msg">${msgHtml}</div>
      <table><thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th>Motivo</th><th>Cantidad</th><th>Referencia</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.fecha}</td><td>${r.insumo_nombre}</td><td>${r.tipo}</td><td>${r.motivo}</td><td>${num(r.cantidad)} ${r.insumo_unidad}</td><td>${r.referencia || ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin movimientos todavia.</td></tr>'}</tbody></table>
    `;
    container.querySelector('#form-mov').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api.post('inventario-insumos', {
          insumo_id: Number(f.insumo_id.value),
          tipo: f.tipo.value,
          motivo: f.motivo.value,
          cantidad: Number(f.cantidad.value),
          referencia: f.referencia.value,
          fecha: f.fecha.value,
        });
        load(`<p class="result-msg ok">Movimiento registrado.</p>`);
      } catch (err) {
        load(`<p class="result-msg error">${err.message}</p>`);
      }
    };
  }
  load();
}

// ---------- Costeo Estandar ----------
async function renderCosteo(container) {
  const productos = await api.get('productos');
  async function load(msgHtml = '') {
    const fichas = await api.get('costeo-estandar');
    container.innerHTML = `
      <h2>Costeo Estandar</h2>
      <p class="note">Ficha de costo por lote de produccion. Costo unitario = (insumos masa + insumos relleno + mano de obra) / porciones por lote. Mano de obra = (horas armado + masa + relleno + empaquetado) x personas x costo hora.</p>
      <form class="inline-form" id="form-costeo">
        <label>Producto <select name="producto_id">${productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('')}</select></label>
        <label>Porciones por lote <input name="porciones_por_lote" type="number" step="0.01" required></label>
        <label>Horas armado <input name="horas_armado" type="number" step="0.01"></label>
        <label>Horas masa <input name="horas_masa" type="number" step="0.01"></label>
        <label>Horas relleno <input name="horas_relleno" type="number" step="0.01"></label>
        <label>Horas empaquetado <input name="horas_empaquetado" type="number" step="0.01"></label>
        <label>Personas <input name="personas" type="number" step="0.01" value="1"></label>
        <label>Costo hora M.O. <input name="costo_hora_mano_obra" type="number" step="0.01"></label>
        <label>Costo insumos masa <input name="costo_insumos_masa" type="number" step="0.01"></label>
        <label>Costo insumos relleno <input name="costo_insumos_relleno" type="number" step="0.01"></label>
        <button type="submit">Guardar ficha</button>
      </form>
      <div id="costeo-msg">${msgHtml}</div>
      <table><thead><tr><th>Producto</th><th>Porciones</th><th>Costo M.O.</th><th>Costo insumos</th><th>Costo unitario</th><th>Actualizado</th><th></th></tr></thead>
      <tbody>${fichas.map((r) => `<tr>
        <td>${r.producto_nombre}</td><td>${num(r.porciones_por_lote)}</td>
        <td>${money((r.horas_armado + r.horas_masa + r.horas_relleno + r.horas_empaquetado) * r.personas * r.costo_hora_mano_obra)}</td>
        <td>${money(r.costo_insumos_masa + r.costo_insumos_relleno)}</td>
        <td>${money(r.costoUnitarioCalculado)}</td>
        <td>${r.fecha_actualizacion || ''}</td>
        <td><button class="danger" data-del="${r.producto_id}">Eliminar</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">Sin fichas cargadas.</td></tr>'}</tbody></table>
    `;
    container.querySelector('#form-costeo').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {};
      for (const el of f.elements) if (el.name) data[el.name] = el.type === 'number' ? Number(el.value || 0) : el.value;
      try {
        await api.post('costeo-estandar', data);
        load(`<p class="result-msg ok">Ficha guardada.</p>`);
      } catch (err) {
        load(`<p class="result-msg error">${err.message}</p>`);
      }
    };
    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Eliminar esta ficha de costeo?')) return;
        await api.del(`costeo-estandar/${btn.dataset.del}`);
        load();
      };
    });
  }
  load();
}

// ---------- Recetas BOM ----------
async function renderRecetas(container) {
  const [productos, insumos] = await Promise.all([api.get('productos'), api.get('insumos')]);
  let productoId = productos[0]?.id;
  async function load() {
    const rows = productoId ? await api.get(`recetas-bom?producto_id=${productoId}`) : [];
    container.innerHTML = `
      <h2>Recetas (BOM)</h2>
      <p class="note">Receta insumo por insumo. Se usa para descontar stock en cada produccion, y como metodo de costeo de respaldo cuando el producto no tiene ficha de Costeo Estandar.</p>
      <div class="toolbar">
        <label>Producto: <select id="prod-sel">${productos.map((p) => `<option value="${p.id}" ${p.id === productoId ? 'selected' : ''}>${p.nombre}</option>`).join('')}</select></label>
      </div>
      <form class="inline-form" id="form-receta">
        <label>Insumo <select name="insumo_id">${insumos.map((i) => `<option value="${i.id}">${i.nombre}</option>`).join('')}</select></label>
        <label>Cantidad por unidad <input name="cantidad_por_unidad" type="number" step="0.0001" required></label>
        <label>Unidad <input name="unidad" type="text" placeholder="kg"></label>
        <button type="submit">Agregar a la receta</button>
      </form>
      <table><thead><tr><th>Insumo</th><th>Cantidad por unidad</th><th>Unidad</th><th>Costo insumo</th><th>Costo aportado</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.insumo_nombre}</td><td>${num(r.cantidad_por_unidad)}</td><td>${r.unidad || r.insumo_unidad}</td><td>${money(r.insumo_costo)}</td><td>${money(r.cantidad_por_unidad * r.insumo_costo)}</td><td><button class="danger" data-del="${r.id}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin items en la receta.</td></tr>'}</tbody></table>
    `;
    container.querySelector('#prod-sel').onchange = (e) => { productoId = Number(e.target.value); load(); };
    container.querySelector('#form-receta').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api.post('recetas-bom', {
          producto_id: productoId,
          insumo_id: Number(f.insumo_id.value),
          cantidad_por_unidad: Number(f.cantidad_por_unidad.value),
          unidad: f.unidad.value,
        });
        load();
      } catch (err) { alert(err.message); }
    };
    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Eliminar este item de la receta?')) return;
        await api.del(`recetas-bom/${btn.dataset.del}`);
        load();
      };
    });
  }
  load();
}

// ---------- Export buttons (added to catalog/finance pages) ----------
function addExportButton(container, table) {
  const btn = el(`<a class="btn secondary" href="/api/export/${table}">Exportar CSV</a>`);
  const toolbar = container.querySelector('.toolbar') || (() => {
    const t = document.createElement('div'); t.className = 'toolbar'; container.insertBefore(t, container.children[1]); return t;
  })();
  toolbar.appendChild(btn);
}

// ---------- Router ----------
const routes = {
  dashboard: renderDashboard,
  produccion: renderProduccion,
  ventas: renderVentas,
  inventario: renderInventario,
  costeo: renderCosteo,
  recetas: renderRecetas,
  proveedores: (c) => renderCrud(c, sections.proveedores),
  clientes: (c) => renderCrud(c, sections.clientes),
  insumos: (c) => renderCrud(c, sections.insumos),
  productos: (c) => renderCrud(c, sections.productos),
  gastos: (c) => renderCrud(c, sections.gastos),
};
const exportable = { productos: 'productos', insumos: 'insumos', ventas: 'ventas', produccion: 'produccion', inventario: 'inventario_insumos', clientes: 'clientes', proveedores: 'proveedores', gastos: 'gastos_fijos', costeo: 'costeo_estandar', recetas: 'recetas_bom' };

async function router() {
  const hash = location.hash.replace('#/', '') || 'dashboard';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === hash));
  const container = document.getElementById('app');
  const render = routes[hash] || renderDashboard;
  try {
    await render(container);
    if (exportable[hash] && hash !== 'dashboard') addExportButton(container, exportable[hash]);
  } catch (err) {
    container.innerHTML = `<p class="result-msg error">Error cargando la seccion: ${err.message}</p>`;
  }
}
window.addEventListener('hashchange', router);
router();
