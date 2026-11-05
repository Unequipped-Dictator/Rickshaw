/**
 * input.js — keyboard + touch merged into one intent state.
 * Keyboard: WASD/arrows, Space horn, E/Enter interact.
 * Touch: on-screen buttons (bound by bindTouch()).
 */
export const input = {
  throttle: 0,     // 0..1
  brake: 0,        // 0..1
  steer: 0,        // -1 (left) .. 1 (right)
  horn: false,
  interact: false, // edge flag, consume with consumeInteract()
};

const keys = new Set();
const KEYMAP = {
  w: 'throttle', arrowup: 'throttle',
  s: 'brake', arrowdown: 'brake',
  a: 'steerL', arrowleft: 'steerL',
  d: 'steerR', arrowright: 'steerR',
  ' ': 'horn',
};
const PREVENT = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function refreshFromKeys() {
  input.throttle = keys.has('throttle') ? 1 : 0;
  input.brake = keys.has('brake') ? 1 : 0;
  input.steer = (keys.has('steerR') ? 1 : 0) - (keys.has('steerL') ? 1 : 0);
  input.horn = keys.has('horn');
}

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (!k) return;
  if (PREVENT.has(e.key.toLowerCase())) e.preventDefault();
  if (e.repeat) return;
  if (e.key.toLowerCase() === 'e' || e.key === 'Enter') { input.interact = true; return; }
  keys.add(k);
  refreshFromKeys();
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (!k) return;
  keys.delete(k);
  refreshFromKeys();
});

/** Wire the on-screen touch buttons (ids: t-gas, t-brake, t-left, t-right, t-horn, t-act). */
export function bindTouch() {
  const hold = (id, key) => {
    const b = document.getElementById(id);
    if (!b) return;
    const on = (e) => { e.preventDefault(); keys.add(key); refreshFromKeys(); b.classList.add('active'); };
    const off = (e) => { e.preventDefault(); keys.delete(key); refreshFromKeys(); b.classList.remove('active'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  };
  hold('t-gas', 'throttle');
  hold('t-brake', 'brake');
  hold('t-left', 'steerL');
  hold('t-right', 'steerR');
  hold('t-horn', 'horn');

  const act = document.getElementById('t-act');
  if (act) act.addEventListener('pointerdown', (e) => { e.preventDefault(); input.interact = true; });
}

export function consumeInteract() {
  const v = input.interact;
  input.interact = false;
  return v;
}
