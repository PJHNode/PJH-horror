const Placeholder = (() => {
  const cache = {};

  function face(style) {
    const w = 960, h = 720;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');

    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);

    const skin = { shadow: '#2b2622', whisper: '#d8d4cc', crawler: '#3a1d12', entity: '#1a1a1a' }[style] || '#2b2622';

    const grd = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 420);
    grd.addColorStop(0, skin);
    grd.addColorStop(1, '#000');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 20, 300, 380, 0, 0, Math.PI * 2);
    g.fill();

    // hollow eye sockets
    [[w / 2 - 120, h / 2 - 70], [w / 2 + 120, h / 2 - 60]].forEach(([x, y], i) => {
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(x, y, 85 + i * 8, 70 - i * 6, (i ? 0.2 : -0.2), 0, Math.PI * 2);
      g.fill();
      const eg = g.createRadialGradient(x, y, 0, x, y, 30);
      const iris = style === 'whisper' ? '#e8f4ff' : '#ff1010';
      eg.addColorStop(0, '#fff');
      eg.addColorStop(0.25, iris);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = eg;
      g.beginPath();
      g.arc(x + (i ? -8 : 8), y + 6, 30, 0, Math.PI * 2);
      g.fill();
    });

    // torn mouth
    g.fillStyle = '#050000';
    g.beginPath();
    g.moveTo(w / 2 - 210, h / 2 + 130);
    for (let x = -210; x <= 210; x += 30) {
      g.lineTo(w / 2 + x, h / 2 + 120 + Math.sin(x / 40) * 18);
    }
    g.lineTo(w / 2 + 180, h / 2 + 300);
    g.lineTo(w / 2 - 170, h / 2 + 290);
    g.closePath();
    g.fill();

    // teeth
    g.fillStyle = '#c8bca0';
    for (let x = -190; x <= 180; x += 26) {
      const tx = w / 2 + x;
      g.beginPath();
      g.moveTo(tx, h / 2 + 124);
      g.lineTo(tx + 12, h / 2 + 124);
      g.lineTo(tx + 6, h / 2 + 124 + 40 + Math.random() * 40);
      g.fill();
      g.beginPath();
      g.moveTo(tx + 4, h / 2 + 292);
      g.lineTo(tx + 16, h / 2 + 292);
      g.lineTo(tx + 10, h / 2 + 292 - 30 - Math.random() * 40);
      g.fill();
    }

    // blood streaks from the eyes
    g.strokeStyle = 'rgba(120,0,0,.85)';
    g.lineWidth = 7;
    [w / 2 - 125, w / 2 + 115].forEach(x => {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        let yy = h / 2 - 10;
        let xx = x + (k - 1) * 20;
        g.moveTo(xx, yy);
        for (let s = 0; s < 8; s++) {
          xx += (Math.random() - 0.5) * 10;
          yy += 22;
          g.lineTo(xx, yy);
        }
        g.stroke();
      }
    });

    // glitch slices
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * h;
      const sh = 4 + Math.random() * 30;
      const dx = (Math.random() - 0.5) * 120;
      g.drawImage(c, 0, y, w, sh, dx, y, w, sh);
    }

    // film grain
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 70;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);

    g.fillStyle = 'rgba(160,0,0,.18)';
    g.fillRect(0, 0, w, h);

    return c.toDataURL('image/jpeg', 0.85);
  }

  // Resolves to the first existing assets/<folder>/<name>.<ext>, or null.
  function find(folder, name) {
    const exts = ['png', 'webp', 'jpg', 'jpeg', 'gif'];
    return new Promise(res => {
      const tryNext = i => {
        if (i >= exts.length) return res(null);
        const url = `assets/${folder}/${name}.${exts[i]}`;
        const img = new Image();
        img.onload = () => res(url);
        img.onerror = () => tryNext(i + 1);
        img.src = url;
      };
      tryNext(0);
    });
  }

  async function resolve(name) {
    if (!cache[name]) cache[name] = (await find('jumpscares', name)) || face(name);
    return cache[name];
  }

  function staticTexture() {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 200;
    const g = c.getContext('2d');
    const img = g.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  return { find, resolve, staticTexture };
})();
