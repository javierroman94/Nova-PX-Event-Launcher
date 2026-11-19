/* PX flotante sobre Minecraft: dibuja al panda con su accesorio y muestra lo que dice. No recibe ni envía nada más. */
(function () {
  const ROWS = ['MM.......MM', 'MQM.....MQM', '.MMMMMMMMM.', '.MWWWWWWWM.', '.MQQWWWQQM.', '.MWKWWWKWM.', '.MWWWMWWWM.', '.MWWWWWWWM.', '..MQQQQQM..', 'HM.MWWWWM.MH', 'MM.MWWWWM.MM', 'MQ.MWWWWM.QM', '...MWWWWM...', '..MWMQMWM..'];
  const SH = ['..NNNNNNN..', '.NSSNNNSSN.', '.NNNNNNNNN.', 'NNVVVVVVVNN', 'NVVEEVEEVVN', 'NVVEEVEEVVN', 'NVVVVVVVVVN', '.NNVVVVVNN.', '.NNNNNNNNN.', 'XXNNXNXNNXX', 'NSNNNXNNNSN', 'XXNNXNXNNXX', 'NSNZNNNZNSN', '...X...X...'];
  const SHPAL = { N: '#23232d', S: '#3b3b48', V: '#07070b', E: '#ff3b3b', X: '#e8334a', Z: '#8f1d2c' };
  const PAL = { M: '#f4a3c0', Q: '#ffd6e6', W: '#fff4f8', K: '#1a1a24', H: '#f4a3c0' };
  const COL = { Y: '#ffd23f', R: '#e8334a', K: '#14141f', P: '#ff8fb8', W: '#ffffff', B: '#3b82f6' };
  const ACC = {
    hat: [[-2, 4, 'KKK'], [-1, 4, 'KRK'], [0, 4, 'KKK'], [1, 3, 'KKKKK']],
    bow: [[0, 5, 'P.P'], [1, 5, 'PRP']],
    glasses: [[5, 2, 'KKKKKKK']],
    scarf: [[9, 3, 'RRRRRR'], [10, 3, 'RW'], [11, 3, 'RW']],
    crown: [[-1, 3, 'Y.Y.Y'], [0, 3, 'YYYYY'], [1, 3, 'YRYBY']]
  };
  const cv = document.getElementById('c'); const x = cv.getContext('2d'); const bubble = document.getElementById('bubble');
  const S = 4, OY = 12;
  function draw(acc, skin) {
    x.clearRect(0, 0, cv.width, cv.height);
    if (skin === 'shadow') { SH.forEach((r, ry) => [...r].forEach((ch, rx) => { if (ch === '.') return; x.fillStyle = SHPAL[ch] || '#fff'; x.fillRect(rx * S, OY + ry * S, S, S); })); return; }
    ROWS.forEach((r, ry) => [...r].forEach((ch, rx) => { if (ch === '.') return; x.fillStyle = PAL[ch] || '#fff'; x.fillRect(rx * S, OY + ry * S, S, S); }));
    (ACC[acc] || []).forEach(([r, c, t]) => [...t].forEach((k, j) => { if (k === '.') return; x.fillStyle = COL[k] || '#fff'; x.fillRect((c + j) * S, OY + r * S, S, S); }));
  }
  draw('');
  let hideT = 0;
  window.ov.onUpdate((p) => {
    draw(p && p.acc, p && p.skin);
    if (p && p.text) { bubble.textContent = p.text; bubble.hidden = false; clearTimeout(hideT); hideT = setTimeout(() => { bubble.hidden = true; }, 6500); }
  });
}());
