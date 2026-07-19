/**
 * Canvas labeler: renders the current image and its boxes, and handles drawing
 * a new box by dragging, selecting/deleting boxes, and reporting changes.
 *
 * Coordinate spaces:
 *  - "image" coords are pixels in the source image (what we store/export).
 *  - "canvas" coords are the on-screen scaled pixels.
 * `scale` converts between them; all boxes are kept in image coords.
 */
class Labeler {
  constructor(canvas, { onChange, onSelectClassNeeded }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.onSelectClassNeeded = onSelectClassNeeded; // () => classIndex
    this.img = null;
    this.boxes = [];
    this.classes = [];
    this.scale = 1;
    this.drag = null; // {x0,y0,x1,y1} in image coords while drawing

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
  }

  setClasses(classes) {
    this.classes = classes;
    this.render();
  }

  /** image: HTMLImageElement (already loaded), boxes: array in image coords. */
  setImage(img, boxes) {
    this.img = img;
    this.boxes = boxes.map((b) => ({ ...b }));
    this._fit();
    this.render();
  }

  clear() {
    this.img = null;
    this.boxes = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _fit() {
    // Fit the image inside the available wrapper while keeping aspect ratio.
    const wrap = this.canvas.parentElement;
    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    const s = Math.min(maxW / this.img.naturalWidth, maxH / this.img.naturalHeight, 1);
    this.scale = s;
    this.canvas.width = Math.round(this.img.naturalWidth * s);
    this.canvas.height = Math.round(this.img.naturalHeight * s);
  }

  _evtToImage(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / this.scale,
      y: (e.clientY - r.top) / this.scale,
    };
  }

  _down(e) {
    if (!this.img) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this._evtToImage(e);
    // Click on an existing box's delete handle (top-right corner) removes it.
    const hit = this._hitDeleteHandle(p);
    if (hit >= 0) {
      this.boxes.splice(hit, 1);
      this._changed();
      this.render();
      return;
    }
    this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }

  _move(e) {
    if (!this.drag) return;
    const p = this._evtToImage(e);
    this.drag.x1 = p.x;
    this.drag.y1 = p.y;
    this.render();
  }

  _up() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    // Ignore stray clicks; require a box of a few pixels.
    if (w < 4 || h < 4) { this.render(); return; }
    const cls = this.onSelectClassNeeded();
    this.boxes.push({
      x: Math.round(x), y: Math.round(y),
      w: Math.round(w), h: Math.round(h), cls,
    });
    this._changed();
    this.render();
  }

  _hitDeleteHandle(p) {
    const r = 9 / this.scale;
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      const hx = b.x + b.w;
      const hy = b.y;
      if (Math.abs(p.x - hx) < r && Math.abs(p.y - hy) < r) return i;
    }
    return -1;
  }

  deleteBox(i) {
    this.boxes.splice(i, 1);
    this._changed();
    this.render();
  }

  undo() {
    if (this.boxes.length) {
      this.boxes.pop();
      this._changed();
      this.render();
    }
  }

  _changed() {
    if (this.onChange) this.onChange(this.boxes.map((b) => ({ ...b })));
  }

  _color(cls) {
    const c = this.classes[cls];
    return c ? c.color : '#ffb020';
  }

  render() {
    if (!this.img) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale;

    for (const b of this.boxes) {
      const color = this._color(b.cls);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
      // Class label chip
      const name = this.classes[b.cls] ? this.classes[b.cls].name : `#${b.cls}`;
      ctx.font = '11px sans-serif';
      const tw = ctx.measureText(name).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(b.x * s, b.y * s - 15, tw, 15);
      ctx.fillStyle = '#12181f';
      ctx.fillText(name, b.x * s + 4, b.y * s - 4);
      // Delete handle (top-right)
      ctx.beginPath();
      ctx.arc((b.x + b.w) * s, b.y * s, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#12181f';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText('×', (b.x + b.w) * s - 3, b.y * s + 4);
    }

    if (this.drag) {
      const d = this.drag;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        Math.min(d.x0, d.x1) * s, Math.min(d.y0, d.y1) * s,
        Math.abs(d.x1 - d.x0) * s, Math.abs(d.y1 - d.y0) * s
      );
      ctx.setLineDash([]);
    }
  }
}
