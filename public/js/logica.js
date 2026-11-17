(() => {
  const $ = (selector) => document.querySelector(selector);
  const statusNames = { operativo: 'Operativo', pendiente: 'Pendiente', revision: 'En revisión', resuelto: 'Resuelto' };
  const statusVisual = { operativo: 'ok', pendiente: 'bad', revision: 'rev', resuelto: 'ok' };
  const reportVisual = { pendiente: 'pend', revision: 'rev', resuelto: 'res' };
  const reportStatusOptions = { pendiente: 'Pendiente', revision: 'En revisión', resuelto: 'Resuelto' };
  const fanSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 6 9 3.5 7 5s0 4.4 3.4 5.4M13.6 12c4.4 0 6.9-3 5.4-5s-4.4 0-5.4 3.4M12 13.6c0 4.4 3 6.9 5 5.4s0-4.4-3.4-5.4M10.4 12C6 12 3.5 15 5 17s4.4 0 5.4-3.4"/></svg>';
  let dashboard = { rooms: [], reports: [], counts: {} };
  let roomId = null;
  let equipmentFilter = 'all';
  let reportFilter = 'all';
  let sectionFilter = 'all';
  let searchTerm = '';
  let selectedEquipment = null;
  let animatePlan = true;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  function announce(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('on');
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => toast.classList.remove('on'), 2600);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
    return result;
  }

  async function refreshDashboard() {
    try {
      const data = await api('/api/dashboard');
      dashboard = data;
      if (!dashboard.rooms.some((room) => room.id === roomId)) roomId = dashboard.rooms[0]?.id ?? null;
      render();
    } catch (error) {
      $('#ttl').textContent = 'No se pudo cargar el sistema';
      $('#plan').innerHTML = `<p class="empty">${escapeHtml(error.message)}. Revisa que MySQL esté iniciado y vuelve a cargar.</p>`;
      $('#rgrid').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    }
  }

  function render() {
    renderRoomTabs();
    renderRoom();
    renderReports();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  function renderRoomTabs() {
    $('#rooms').innerHTML = dashboard.rooms.map((room) =>
      `<button type="button" class="${room.id === roomId ? 'on' : ''}" data-room="${room.id}" role="tab" aria-selected="${room.id === roomId}">${escapeHtml(room.code)}</button>`
    ).join('');
    $('#open-equipment').disabled = roomId === null;
  }

  function renderRoom() {
    const room = dashboard.rooms.find((item) => item.id === roomId);
    if (!room) {
      $('#blk').textContent = 'Inventario';
      $('#ttl').textContent = 'No hay salones activos';
      $('#meta').textContent = '';
      $('#stats').innerHTML = '';
      $('#secf').innerHTML = '<option value="all">Todas las secciones</option>';
      $('#plan').innerHTML = '<p class="empty">Primero registra los salones en MySQL.</p>';
      return;
    }

    $('#blk').textContent = room.building;
    $('#ttl').textContent = `Salón ${room.code}`;
    $('#meta').textContent = `${room.equipment.length} equipos registrados`;
    const counts = { operativo: 0, pendiente: 0, revision: 0 };
    room.equipment.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status]++; });
    const cards = [
      ['all', 'var(--blue)', 'Equipos', room.equipment.length],
      ['operativo', 'var(--ok)', 'Operativos', counts.operativo],
      ['pendiente', 'var(--bad)', 'Con daño', counts.pendiente],
      ['revision', 'var(--rev)', 'En revisión', counts.revision],
    ];
    $('#stats').innerHTML = cards.map(([key, color, label, count]) =>
      `<button type="button" class="stat ${equipmentFilter === key ? 'on' : ''}" data-equipment-filter="${key}"><span><i class="dot" style="background:${color}"></i>${label}</span><b>${count}</b></button>`
    ).join('');

    const sections = [...new Set(room.equipment.map((item) => item.section || 'A'))].sort();
    if (sectionFilter !== 'all' && !sections.includes(sectionFilter)) sectionFilter = 'all';
    $('#secf').innerHTML = `<option value="all">Todas las secciones</option>${sections.map((section) =>
      `<option value="${escapeHtml(section)}" ${sectionFilter === section ? 'selected' : ''}>Sección ${escapeHtml(section)}</option>`
    ).join('')}`;

    if (!room.equipment.length) {
      $('#plan').innerHTML = '<p class="empty">Este salón está agregado, pero aún no tiene equipos. Pulsa “Agregar equipo” para cargar su inventario.</p>';
      return;
    }

    const sectionsMarkup = sections.filter((section) => sectionFilter === 'all' || sectionFilter === section).map((section, index) => {
      const items = room.equipment.filter((item) => (item.section || 'A') === section);
      const devices = items.map((item) => {
        const visualStatus = statusVisual[item.status] || 'ok';
        const shortCode = item.code.startsWith(`${room.code}-`) ? item.code.slice(room.code.length + 1) : item.code;
        const matchesFilter = equipmentFilter === 'all' || item.status === equipmentFilter;
        const matchesSearch = !searchTerm || item.code.toLowerCase().includes(searchTerm);
        const dim = (!matchesFilter || !matchesSearch) ? 'dim' : '';
        return `<button type="button" class="dev ${dim}" data-device="${item.id}" data-s="${visualStatus}" aria-label="${escapeHtml(item.code)}, ${escapeHtml(statusNames[item.status])}"><span class="bdg">${visualStatus === 'ok' ? '✓' : visualStatus === 'bad' ? '!' : '…'}</span>${item.kind === 'ventilador' ? fanSvg : `<span class="mon">${visualStatus === 'bad' ? 'ERR' : ''}</span>`}<span class="lb">${escapeHtml(shortCode)}</span></button>`;
      }).join('');
      return `<section class="sec"><div class="sh"><b>Sección ${escapeHtml(section)}</b><span>${items.length} equipos</span></div><div class="row"><div class="desk">${devices}</div></div></section>`;
    }).join('');

    $('#plan').innerHTML = `<div class="front"><div class="teach">Docente</div><div class="board"></div></div>${sectionsMarkup}<div class="door">Entrada</div>`;
    $('#plan').classList.toggle('enter', animatePlan);
    animatePlan = false;
  }

  function renderReports() {
    const reports = dashboard.reports.filter((report) => reportFilter === 'all' || report.status === reportFilter);
    $('#rn').textContent = `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'} · ${dashboard.reports.length} en total`;
    const filters = [['all', 'Todos'], ['pendiente', 'Pendiente'], ['revision', 'En revisión'], ['resuelto', 'Resuelto']];
    $('#rchips').innerHTML = filters.map(([key, label]) =>
      `<button type="button" data-report-filter="${key}" class="${reportFilter === key ? 'on' : ''}">${label}</button>`
    ).join('');
    $('#rgrid').innerHTML = reports.length ? reports.map((report, index) => {
      const date = new Date(report.created_at).toLocaleString('es-CO');
      const options = Object.entries(reportStatusOptions).map(([key, label]) =>
        `<option value="${key}" ${report.status === key ? 'selected' : ''}>${label}</option>`
      ).join('');
      return `<article class="rc" style="animation-delay:${index * 0.04}s"><div class="rt"><b>${escapeHtml(report.equipment_code)}</b><span class="pill ${reportVisual[report.status]}">${reportStatusOptions[report.status]}</span></div><small>${escapeHtml(report.building)} · Salón ${escapeHtml(report.room_code)}</small><h3>${escapeHtml(report.category)}</h3><p>${escapeHtml(report.description || 'Sin descripción.')}</p><div class="rb"><small>${escapeHtml(date)}</small><select data-report-id="${report.id}" aria-label="Cambiar estado de ${escapeHtml(report.equipment_code)}">${options}</select></div></article>`;
    }).join('') : '<p class="empty">No hay reportes en este estado. Toca un equipo en el mapa para crear uno.</p>';
  }

  function openReport(device) {
    const room = dashboard.rooms.find((item) => item.id === roomId);
    selectedEquipment = room?.equipment.find((item) => item.id === Number(device.dataset.device));
    if (!selectedEquipment) return;
    const code = selectedEquipment.code.startsWith(`${room.code}-`) ? selectedEquipment.code.slice(room.code.length + 1) : selectedEquipment.code;
    $('#dt').textContent = code;
    $('#ds').textContent = `${room.building} · Salón ${room.code}`;
    const radioStatus = { operativo: 'ok', pendiente: 'bad', revision: 'rev' }[selectedEquipment.status] || 'ok';
    const radio = document.querySelector(`input[name="st"][value="${radioStatus}"]`);
    if (radio) radio.checked = true;
    $('#cat').value = selectedEquipment.lastCategory || 'Pantalla / monitor';
    $('#note').value = selectedEquipment.lastDescription || '';
    $('#dlg').showModal();
  }

  function renderIllustrations() {
    const monitor = (x, y, color, label) => `<rect x="${x}" y="${y}" width="70" height="46" rx="6" fill="#1b3a6b" stroke="${color}" stroke-width="4"/><rect x="${x + 27}" y="${y + 46}" width="16" height="10" fill="#9fb0d0"/>${label ? `<text x="${x + 35}" y="${y + 31}" fill="${color}" font-size="14" font-weight="800" text-anchor="middle">${label}</text>` : ''}`;
    const art = (kind) => {
      let objects = '';
      if (kind === 1) for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
        const damaged = row === 1 && col === 4;
        objects += monitor(70 + col * 115, 120 + row * 100, damaged ? '#ff6b77' : '#3ecf9a', damaged ? 'ERR' : '');
      }
      if (kind === 2) objects = `<g transform="translate(215 90) scale(3.2)">${monitor(0, 0, '#ff6b77', 'ERR')}</g>`;
      if (kind === 3) {
        objects = '<rect x="270" y="50" width="260" height="350" rx="22" fill="#f2f5fa"/>';
        for (let index = 0; index < 3; index++) objects += `<circle cx="320" cy="${130 + index * 90}" r="22" fill="${index < 2 ? '#12805c' : '#b86200'}"/><text x="320" y="${137 + index * 90}" fill="#fff" font-size="22" font-weight="800" text-anchor="middle">${index < 2 ? '✓' : '…'}</text><rect x="360" y="${118 + index * 90}" width="140" height="12" rx="6" fill="#12203a" opacity=".8"/><rect x="360" y="${140 + index * 90}" width="90" height="10" rx="5" fill="#12203a" opacity=".3"/>`;
      }
      return `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gk${kind}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4aa3ff"/><stop offset="1" stop-color="#1f6fe5"/></linearGradient></defs><rect width="800" height="450" fill="url(#gk${kind})"/><circle cx="700" cy="70" r="46" fill="#ffd400"/>${objects}</svg>`;
    };
    $('#exImg').insertAdjacentHTML('afterbegin', art(1));
    document.querySelectorAll('.par-img').forEach((element) => { element.innerHTML = art(Number(element.dataset.k)); });
  }

  function spy() {
    const reportsPage = !$('#repv').hidden;
    let current = 'nh';
    if (!reportsPage) {
      const threshold = innerHeight * 0.35;
      for (const id of ['como', 'mapa']) {
        const element = $(`#${id}`);
        if (element && element.getBoundingClientRect().top < threshold) current = id;
      }
    } else current = '';
    $('#nh').classList.toggle('on', current === 'nh');
    document.querySelectorAll('[data-sc]').forEach((link) => link.classList.toggle('on', link.dataset.sc === current));
    $('#rep').classList.toggle('on', reportsPage);
  }

  function go() {
    const reportsPage = location.hash === '#reportes';
    $('#mapv').hidden = reportsPage;
    $('#repv').hidden = !reportsPage;
    spy();
    if (reportsPage) renderReports();
    else { animatePlan = true; renderRoom(); }
    scrollTo(0, 0);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  document.addEventListener('click', (event) => {
    const roomButton = event.target.closest('[data-room]');
    if (roomButton) {
      roomId = Number(roomButton.dataset.room);
      equipmentFilter = 'all'; sectionFilter = 'all'; searchTerm = ''; $('#q').value = '';
      animatePlan = true; renderRoomTabs(); renderRoom();
      return;
    }
    const statusCard = event.target.closest('[data-equipment-filter]');
    if (statusCard) { equipmentFilter = statusCard.dataset.equipmentFilter; renderRoom(); return; }
    const device = event.target.closest('[data-device]');
    if (device) openReport(device);
  });

  $('#secf').addEventListener('change', (event) => { sectionFilter = event.target.value; renderRoom(); });
  $('#q').addEventListener('input', (event) => { searchTerm = event.target.value.trim().toLowerCase(); renderRoom(); });
  $('#rchips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-filter]');
    if (button) { reportFilter = button.dataset.reportFilter; renderReports(); }
  });

  $('#sv').addEventListener('click', async (event) => {
    event.preventDefault();
    const submit = event.currentTarget;
    const statusChoice = document.querySelector('input[name="st"]:checked')?.value;
    if (!statusChoice || !selectedEquipment) return announce('Selecciona un estado para el equipo.');
    submit.disabled = true;
    try {
      if (statusChoice === 'ok') {
        if (selectedEquipment.lastReportId) {
          await api(`/api/reports/${selectedEquipment.lastReportId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'resuelto' }) });
        }
        $('#dlg').close();
        announce('Equipo marcado como operativo.');
      } else {
        const description = $('#note').value.trim();
        await api('/api/reports', { method: 'POST', body: JSON.stringify({
          equipmentId: selectedEquipment.id,
          category: $('#cat').value,
          description,
          status: statusChoice === 'bad' ? 'pendiente' : 'revision',
        }) });
        $('#dlg').close();
        announce('Reporte guardado en MySQL.');
      }
      await refreshDashboard();
    } catch (error) {
      announce(error.message);
    } finally { submit.disabled = false; }
  });

  $('#cx').addEventListener('click', () => $('#dlg').close());
  $('#dlg').addEventListener('click', (event) => { if (event.target === $('#dlg')) $('#dlg').close(); });

  $('#open-equipment').addEventListener('click', () => {
    const room = dashboard.rooms.find((item) => item.id === roomId);
    if (!room) return;
    $('#equipment-room').textContent = `${room.building} · Salón ${room.code}`;
    $('#equipment-dialog').showModal();
  });
  $('#close-equipment').addEventListener('click', () => $('#equipment-dialog').close());
  $('#cancel-equipment').addEventListener('click', () => $('#equipment-dialog').close());
  $('#equipment-dialog').addEventListener('click', (event) => { if (event.target === $('#equipment-dialog')) $('#equipment-dialog').close(); });

  $('#equipment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submit = formElement.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const data = new FormData(formElement);
      await api('/api/equipment', { method: 'POST', body: JSON.stringify({
        roomId, kind: data.get('kind'), section: data.get('section'), position: Number(data.get('position')),
      }) });
      $('#equipment-dialog').close();
      formElement.reset();
      announce('Equipo agregado al inventario.');
      await refreshDashboard();
    } catch (error) { announce(error.message); }
    finally { submit.disabled = false; }
  });

  $('#rgrid').addEventListener('change', async (event) => {
    const select = event.target.closest('[data-report-id]');
    if (!select) return;
    const reportId = select.dataset.reportId;
    select.disabled = true;
    try {
      await api(`/api/reports/${reportId}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
      announce('Estado actualizado y guardado en MySQL.');
      await refreshDashboard();
    } catch (error) { announce(error.message); await refreshDashboard(); }
  });

  addEventListener('hashchange', go);
  document.querySelectorAll('[data-sc], [data-go]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    const target = link.dataset.sc || link.dataset.go;
    if (!$('#repv').hidden) location.hash = '#inicio';
    setTimeout(() => $(`#${target}`)?.scrollIntoView({ behavior: 'smooth' }), 0);
  }));
  addEventListener('scroll', spy, { passive: true });

  function initEffects() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      const small = innerWidth < 860;
      gsap.timeline({ scrollTrigger: { trigger: '#ex', start: 'top 36px', end: '+=110%', scrub: 0.7, pin: true, anticipatePin: 1 } })
        .fromTo('#exImg', { width: small ? '82%' : '54%', height: '46vh', borderRadius: 36 }, { width: '100%', height: 'calc(100vh - 36px)', borderRadius: 0, ease: 'none' }, 0)
        .fromTo('#exImg>svg', { scale: 1.4 }, { scale: 1, ease: 'none' }, 0)
        .to('.ex-hint', { opacity: 0, ease: 'none', duration: 0.2 }, 0)
        .fromTo('.ex-txt', { opacity: 0, y: 50 }, { opacity: 1, y: 0, ease: 'none' }, 0.4);
      document.querySelectorAll('.par-card').forEach((card) => {
        gsap.fromTo(card, { clipPath: 'inset(14% 14% 14% 14% round 36px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none', scrollTrigger: { trigger: card, start: 'top 95%', end: 'top 40%', scrub: 0.7 } });
        gsap.fromTo(card.querySelector('.par-img'), { yPercent: -9 }, { yPercent: 9, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      addEventListener('load', () => ScrollTrigger.refresh());
    });
  }

  renderIllustrations();
  go();
  refreshDashboard();
  initEffects();
})();
