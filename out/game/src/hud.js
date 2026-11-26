// Meridian Sky Rally — the heads-up display.
// One clear job: show altitude, speed and heading (plus throttle, fuel,
// score, timer and the attitude ball) on the glass, updated every frame.
const KNOTS = 1.94384; // m/s to knots
const FEET = 3.28084; // m to feet

function compassLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const els = {
    speed: el('hud-speed'),
    altitude: el('hud-alt'),
    vsi: el('hud-vsi'),
    heading: el('hud-heading'),
    compass: el('hud-compass'),
    throttle: el('hud-throttle'),
    throttleBar: el('hud-throttle-bar'),
    fuel: el('hud-fuel'),
    fuelBar: el('hud-fuel-bar'),
    score: el('hud-score'),
    timer: el('hud-timer'),
    rings: el('hud-rings'),
    phase: el('hud-phase'),
    message: el('hud-message'),
    warn: el('hud-warn'),
    attitude: el('hud-attitude'),
  };
  const actx = els.attitude.getContext('2d');

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Draw the attitude ball: horizon tilted by roll, shifted by pitch. */
  function drawAttitude(pitch, roll) {
    const c = actx;
    const W = 150;
    const H = 150;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    c.clip();
    c.translate(W / 2, H / 2);
    c.rotate(-roll);
    const pitchPx = Math.max(-60, Math.min(60, (-pitch * 180) / Math.PI * 1.6));
    c.translate(0, pitchPx);
    // Sky above the horizon, ground below it.
    c.fillStyle = '#3f8fd2';
    c.fillRect(-80, -140, 160, 140);
    c.fillStyle = '#7a5a34';
    c.fillRect(-80, 0, 160, 140);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-80, 0);
    c.lineTo(80, 0);
    c.stroke();
    // Pitch ladder lines every 10 degrees.
    c.lineWidth = 1;
    for (const deg of [-20, -10, 10, 20]) {
      const y = (-deg * 1.6);
      c.beginPath();
      c.moveTo(-24, y);
      c.lineTo(24, y);
      c.stroke();
    }
    c.restore();
    // Fixed aircraft symbol + bezel.
    c.strokeStyle = '#ffd23e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W / 2 - 26, H / 2);
    c.lineTo(W / 2 - 8, H / 2);
    c.moveTo(W / 2 + 8, H / 2);
    c.lineTo(W / 2 + 26, H / 2);
    c.moveTo(W / 2, H / 2);
    c.lineTo(W / 2, H / 2 + 8);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    c.stroke();
  }

  /** Update every HUD readout from the live flight state. */
  function update(state, mission) {
    const knots = Math.round(state.speed * KNOTS);
    const feet = Math.round((state.pos.y - 2) * FEET);
    const hdg = ((state.heading * 180) / Math.PI % 360 + 360) % 360;
    els.speed.textContent = String(knots).padStart(3, '0');
    els.altitude.textContent = String(Math.max(0, feet)).padStart(5, '0');
    const vsi = Math.round(state.verticalSpeed * FEET * 60 / 100) * 100;
    els.vsi.textContent = (vsi >= 0 ? '+' : '') + vsi;
    els.heading.textContent = `${String(Math.round(hdg)).padStart(3, '0')}° ${compassLabel(hdg)}`;
    // Compass tape: the heading strip scrolls with the aircraft.
    let tape = '';
    for (let d = -60; d <= 60; d += 15) {
      const deg = ((Math.round(hdg) + d) % 360 + 360) % 360;
      const label = deg % 45 === 0 ? compassLabel(deg) : String(deg).padStart(3, '0');
      tape += `<span class="${d === 0 ? 'tick-now' : ''}">${label}</span>`;
    }
    els.compass.innerHTML = tape;
    els.throttle.textContent = `${Math.round(state.throttle * 100)}%`;
    els.throttleBar.style.width = `${Math.round(state.throttle * 100)}%`;
    els.fuel.textContent = `${Math.round(state.fuel)}%`;
    els.fuelBar.style.width = `${Math.round(state.fuel)}%`;
    els.fuelBar.classList.toggle('low', state.fuel < 25);
    els.score.textContent = String(mission.score);
    els.timer.textContent = fmtTime(mission.elapsed);
    els.rings.textContent = `${mission.ringsPassed}/${mission.ringsTotal}`;
    els.phase.textContent = mission.phaseLabel;
    drawAttitude(state.pitch, state.roll);
    // Warnings: stall, low fuel, terrain.
    const warnings = [];
    if (state.speed < 27 && !state.onGround) warnings.push('STALL');
    if (state.fuel < 25) warnings.push('LOW FUEL');
    if (state.pos.y - mission.groundBelow < 25 && !state.onGround) warnings.push('TERRAIN');
    els.warn.textContent = warnings.join('  •  ');
    els.warn.style.visibility = warnings.length ? 'visible' : 'hidden';
  }

  function showMessage(text, ms = 2600) {
    els.message.textContent = text;
    els.message.classList.add('show');
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => els.message.classList.remove('show'), ms);
  }

  return { update, showMessage };
}
