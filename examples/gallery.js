// gallery.js — builds one interactive card per scene of <body data-group>.
(async function () {
  const root = document.getElementById('cards');
  const group = document.body.dataset.group;
  let sprites;
  try {
    sprites = await ZRPGWater.load('../');
  } catch (e) {
    root.innerHTML = '<p class="err"></p>';
    root.firstChild.textContent = e.message + '\nOpen this page from the examples/ folder of the zrpg-art repo, so that ../catalog.js and ../atlas/ resolve.';
    return;
  }
  const SHORES = ['grass', 'rocky', 'sand'];
  for (const scene of WATER_SCENES.filter(s => s.group === group)) {
    const card = document.createElement('section');
    card.className = 'card'; card.id = scene.id;
    card.innerHTML = `
      <h2></h2><p class="desc"></p>
      <div class="stage"><canvas></canvas></div>
      <div class="controls">
        <div class="seg" role="group" aria-label="Shore">${SHORES.map(s =>
          `<button type="button" data-shore="${s}">${ZRPGWater.STYLES[s].label}</button>`).join('')}</div>
        <button type="button" class="plain" data-act="seed">New variation</button>
        <label class="chk"><input type="checkbox" data-act="debug"> Debug bands</label>
        <a href="${group}.md#${scene.id}">Spec</a>
        <span class="meta"></span>
      </div>`;
    card.querySelector('h2').textContent = scene.title;
    card.querySelector('.desc').textContent = scene.desc;
    root.appendChild(card);

    const view = ZRPGWater.mount(card.querySelector('canvas'), sprites, scene);
    const meta = card.querySelector('.meta');
    let shore = scene.shore, seed = scene.seed;
    const sync = () => {
      card.querySelectorAll('[data-shore]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shore === shore)));
      const st = view.stats;
      meta.textContent = `seed ${st.seed} · shoreline ${st.perimeter} px · ${st.decor} decor`;
    };
    card.querySelectorAll('[data-shore]').forEach(b => b.addEventListener('click', () => {
      shore = b.dataset.shore; view.set({ shore }); sync();
    }));
    card.querySelector('[data-act=seed]').addEventListener('click', () => {
      seed = 1 + Math.floor(Math.random() * 9999); view.set({ seed }); sync();
    });
    card.querySelector('[data-act=debug]').addEventListener('change', e => view.set({ debug: e.target.checked }));
    sync();
  }
})();
