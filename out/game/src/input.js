// Meridian Sky Rally — keyboard and mouse input.
// One clear job: turn keys and pointer drags into the flight controls the
// flight model consumes: pitch, roll, throttle and brake.
export function createInput(canvas) {
  const keys = new Set();
  const codes = new Set();
  const state = {
    pitch: 0, // -1..1, positive = pull up
    roll: 0, // -1..1, positive = bank right
    throttleDelta: 0,
    brake: false,
    mouseSteer: { x: 0, y: 0, active: false },
  };
  let dragStart = null;
  let dragCurrent = null;

  const KEYMAP = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ShiftLeft: 'throttleUp',
    ShiftRight: 'throttleUp',
    KeyE: 'throttleUp',
    ControlLeft: 'throttleDown',
    KeyQ: 'throttleDown',
    Space: 'brake',
  };

  function onKeyDown(e) {
    codes.add(e.code);
    const action = KEYMAP[e.code];
    if (action) {
      keys.add(action);
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    codes.delete(e.code);
    const action = KEYMAP[e.code];
    if (action) keys.delete(action);
  }
  function onPointerDown(e) {
    dragStart = { x: e.clientX, y: e.clientY };
    dragCurrent = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (dragStart) dragCurrent = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    dragStart = null;
    dragCurrent = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  /** Read the current control state (call once per simulation step). */
  function read() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('up')) pitch += 1;
    if (keys.has('down')) pitch -= 1;
    if (keys.has('left')) roll -= 1;
    if (keys.has('right')) roll += 1;
    // Mouse drag steers too: drag up to climb, sideways to bank.
    if (dragStart && dragCurrent) {
      const dx = (dragCurrent.x - dragStart.x) / 160;
      const dy = (dragCurrent.y - dragStart.y) / 160;
      roll += Math.max(-1, Math.min(1, dx));
      pitch += Math.max(-1, Math.min(1, -dy));
      state.mouseSteer = { x: dx, y: dy, active: true };
    } else {
      state.mouseSteer.active = false;
    }
    let throttleDelta = 0;
    if (keys.has('throttleUp')) throttleDelta += 1;
    if (keys.has('throttleDown')) throttleDelta -= 1;
    state.pitch = Math.max(-1, Math.min(1, pitch));
    state.roll = Math.max(-1, Math.min(1, roll));
    state.throttleDelta = throttleDelta;
    state.brake = keys.has('brake');
    return state;
  }

  /** True while the named key code is held (menus: Enter, KeyR, KeyP). */
  function pressed(code) {
    return codes.has(code);
  }

  return { read, pressed, keys };
}
