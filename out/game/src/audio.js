// Meridian Sky Rally — sound, synthesised live, no audio files.
// One clear job: engine hum, wind rush, ring chimes and touchdown thuds
// from the Web Audio API, all generated at run time.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    } catch {
      return false;
    }
    // Engine: two detuned sawtooths through a low-pass filter.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.005;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass, louder with speed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    noise.start();
    return true;
  }

  return {
    /** Call from a user gesture; browsers block audio before one. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      started = true;
    },
    /** Continuous engine + wind, driven by throttle and airspeed each frame. */
    update(throttle, speedKnots, airborne) {
      if (!started || !ctx) return;
      const t = ctx.currentTime;
      const rpm = 52 + throttle * 68 + (airborne ? 6 : 0);
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 1.007, t, 0.08);
      engineGain.gain.setTargetAtTime(0.028 + throttle * 0.05, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, (speedKnots / 170) * 0.12), t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speedKnots * 6, t, 0.2);
    },
    /** Two-note chime when a ring is flown. */
    ring(centred) {
      if (!ctx) return;
      const notes = centred ? [880, 1318] : [659, 988];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.5);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.55);
      });
    },
    /** Low thud for a touchdown, sharper crack for a crash. */
    thud(hard) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hard ? 90 : 70, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(hard ? 0.5 : 0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    },
    /** Short warning beep (stall, low fuel). */
    beep(freq = 1046) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    },
  };
}
