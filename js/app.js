/** App wiring: image loading, class palette, filmstrip, navigation, export. */
(() => {
  // Default taxonomy for aerial demining imagery. Deliberately coarse — these
  // are the categories a spotter can plausibly distinguish from the air.
  // Users can add/remove classes; the choice is saved.
  const DEFAULT_CLASSES = [
    { name: 'anti-tank mine', color: '#ff6b6b' },
    { name: 'anti-personnel mine', color: '#ffb020' },
    { name: 'UXO / shell', color: '#4dd0e1' },
    { name: 'submunition', color: '#b388ff' },
    { name: 'suspicious object', color: '#9ccc65' },
  ];

  const state = {
    images: [], // {name, img, width, height, boxes:[], thumb}
    idx: -1,
    classes: [],
    activeClass: 0,
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');

  const persisted = Store.read();
  state.classes = persisted.classes || DEFAULT_CLASSES.map((c) => ({ ...c }));

  const labeler = new Labeler(canvas, {
    onChange: (boxes) => {
      const im = state.images[state.idx];
      if (!im) return;
      im.boxes = boxes;
      Store.writeBoxes(im.name, boxes);
      renderBoxList();
      renderStripBadges();
      renderProgress();
    },
    onSelectClassNeeded: () => state.activeClass,
  });
  labeler.setClasses(state.classes);

  // ---- Class palette ----
  function renderClasses() {
    const ul = $('classList');
    ul.innerHTML = '';
    state.classes.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'class-item' + (i === state.activeClass ? ' active' : '');
      li.innerHTML =
        `<span class="swatch" style="background:${c.color}"></span>` +
        `<span class="name"></span>` +
        `<span class="key">${i < 9 ? i + 1 : ''}</span>` +
        `<span class="del" title="Remove class"><svg class="ic"><use href="#i-trash"></use></svg></span>`;
      li.querySelector('.name').textContent = c.name;
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('del')) return;
        state.activeClass = i;
        renderClasses();
      });
      li.querySelector('.del').addEventListener('click', () => removeClass(i));
      ul.appendChild(li);
    });
  }

  function addClass(name) {
    name = name.trim();
    if (!name) return;
    const palette = ['#ff6b6b', '#ffb020', '#4dd0e1', '#b388ff', '#9ccc65', '#f06292', '#4fc3f7', '#aed581'];
    state.classes.push({ name, color: palette[state.classes.length % palette.length] });
    Store.writeClasses(state.classes);
    labeler.setClasses(state.classes);
    renderClasses();
  }

  function removeClass(i) {
    if (state.classes.length <= 1) return;
    // Refuse if boxes still reference this class, to avoid silent relabeling.
    const used = state.images.some((im) => im.boxes.some((b) => b.cls === i));
    if (used && !confirm(`Some boxes use "${state.classes[i].name}". Remove the class and those boxes?`)) return;
    state.images.forEach((im) => {
      im.boxes = im.boxes.filter((b) => b.cls !== i).map((b) => ({ ...b, cls: b.cls > i ? b.cls - 1 : b.cls }));
      Store.writeBoxes(im.name, im.boxes);
    });
    state.classes.splice(i, 1);
    if (state.activeClass >= state.classes.length) state.activeClass = state.classes.length - 1;
    Store.writeClasses(state.classes);
    labeler.setClasses(state.classes);
    renderClasses();
    if (state.idx >= 0) showImage(state.idx);
  }

  $('addClassBtn').addEventListener('click', () => {
    addClass($('newClassName').value);
    $('newClassName').value = '';
  });
  $('newClassName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addClass(e.target.value); e.target.value = ''; }
  });

  // ---- Image loading ----
  $('fileInput').addEventListener('change', (e) => loadFiles(e.target.files));

  function loadFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const saved = Store.read().boxes;
    let pending = files.length;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        state.images.push({
          name: file.name,
          img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          boxes: saved[file.name] ? saved[file.name].map((b) => ({ ...b })) : [],
          thumbUrl: url,
        });
        if (--pending === 0) finishLoad();
      };
      img.onerror = () => { if (--pending === 0) finishLoad(); };
      img.src = url;
    });
  }

  function finishLoad() {
    state.images.sort((a, b) => a.name.localeCompare(b.name));
    $('emptyHint').style.display = 'none';
    renderStrip();
    showImage(state.idx < 0 ? 0 : state.idx);
    renderProgress();
  }

  // ---- Filmstrip ----
  function renderStrip() {
    const strip = $('strip');
    strip.innerHTML = '';
    state.images.forEach((im, i) => {
      const div = document.createElement('div');
      div.className = 'thumb' + (i === state.idx ? ' active' : '');
      div.dataset.i = i;
      div.innerHTML = `<img src="${im.thumbUrl}" alt="">` +
        (im.boxes.length ? `<span class="badge">${im.boxes.length}</span>` : '');
      div.addEventListener('click', () => showImage(i));
      strip.appendChild(div);
    });
  }

  function renderStripBadges() {
    [...$('strip').children].forEach((div) => {
      const im = state.images[+div.dataset.i];
      let badge = div.querySelector('.badge');
      if (im.boxes.length) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; div.appendChild(badge); }
        badge.textContent = im.boxes.length;
      } else if (badge) badge.remove();
    });
  }

  // ---- Navigation ----
  function showImage(i) {
    if (i < 0 || i >= state.images.length) return;
    state.idx = i;
    const im = state.images[i];
    labeler.setImage(im.img, im.boxes);
    $('counter').textContent = `${i + 1} / ${state.images.length}`;
    [...$('strip').children].forEach((d, j) => d.classList.toggle('active', j === i));
    const active = $('strip').children[i];
    if (active) active.scrollIntoView({ block: 'nearest' });
    renderBoxList();
  }

  $('prevBtn').addEventListener('click', () => showImage(state.idx - 1));
  $('nextBtn').addEventListener('click', () => showImage(state.idx + 1));

  function renderBoxList() {
    const ul = $('boxList');
    ul.innerHTML = '';
    const im = state.images[state.idx];
    if (!im) return;
    im.boxes.forEach((b, i) => {
      const li = document.createElement('li');
      li.className = 'box-row';
      const cls = state.classes[b.cls];
      li.innerHTML =
        `<span class="swatch" style="background:${cls ? cls.color : '#888'}"></span>` +
        `<span></span><span class="del" title="Delete box"><svg class="ic"><use href="#i-x"></use></svg></span>`;
      li.children[1].textContent = cls ? cls.name : `#${b.cls}`;
      li.querySelector('.del').addEventListener('click', () => labeler.deleteBox(i));
      ul.appendChild(li);
    });
  }

  function renderProgress() {
    const labeled = state.images.filter((im) => im.boxes.length).length;
    const boxes = state.images.reduce((n, im) => n + im.boxes.length, 0);
    $('progress').textContent = state.images.length
      ? `${labeled}/${state.images.length} images labeled · ${boxes} boxes`
      : '';
  }

  // ---- Keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key >= '1' && e.key <= '9') {
      const n = +e.key - 1;
      if (n < state.classes.length) { state.activeClass = n; renderClasses(); }
    } else if (e.key === 'ArrowRight' || e.key === 'd') showImage(state.idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'a') showImage(state.idx - 1);
    else if ((e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.key === 'Backspace') {
      e.preventDefault(); labeler.undo();
    }
  });

  // ---- Export / import ----
  function dataset() {
    return {
      images: state.images.map((im) => ({
        name: im.name, width: im.width, height: im.height, boxes: im.boxes,
      })),
      classes: state.classes,
    };
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('exportYolo').addEventListener('click', () => {
    const d = dataset();
    if (!d.images.some((im) => im.boxes.length)) return alert('No boxes to export yet.');
    const files = Exporters.yoloFiles(d.images, d.classes);
    download(Zip.build(files), 'minelabeler_yolo.zip');
  });

  $('exportCoco').addEventListener('click', () => {
    const d = dataset();
    if (!d.images.some((im) => im.boxes.length)) return alert('No boxes to export yet.');
    const json = JSON.stringify(Exporters.coco(d.images, d.classes), null, 2);
    download(new Blob([json], { type: 'application/json' }), 'minelabeler_coco.json');
  });

  $('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = Exporters.parseCoco(JSON.parse(reader.result));
        if (parsed.classes.length) {
          state.classes = parsed.classes.map((name, i) => ({
            name, color: (state.classes[i] && state.classes[i].color) || '#ffb020',
          }));
          Store.writeClasses(state.classes);
          labeler.setClasses(state.classes);
          renderClasses();
        }
        Store.mergeBoxes(parsed.byName);
        // Reattach to any already-loaded images.
        state.images.forEach((im) => {
          if (parsed.byName[im.name]) im.boxes = parsed.byName[im.name].map((b) => ({ ...b }));
        });
        if (state.idx >= 0) showImage(state.idx);
        renderStripBadges();
        renderProgress();
        alert('Imported annotations. Load the matching images to see them overlaid.');
      } catch (err) {
        alert('Could not parse that COCO file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  renderClasses();
})();
