// SOLMARIS — keyboard + mouse state. One object the whole game reads; the
// main loop clears the per-frame edges (justPressed) after each update.
import { unlockAudio } from './audio.js';

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // keys pressed this frame (edge-triggered)
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    mouseClicked: false, // left button pressed this frame
    rightDown: false,
    locked: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    unlockAudio();
    const code = event.code;
    input.keys.add(code);
    input.pressed.add(code);
    // Keep the page from scrolling on game keys.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    input.keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (input.locked) {
      input.mouseDX += event.movementX || 0;
      input.mouseDY += event.movementY || 0;
    } else if (input.dragging) {
      input.mouseDX += event.clientX - input.lastX;
      input.mouseDY += event.clientY - input.lastY;
      input.lastX = event.clientX;
      input.lastY = event.clientY;
    }
  }

  function onMouseDown(event) {
    unlockAudio();
    if (event.button === 0) {
      input.mouseDown = true;
      input.mouseClicked = true;
      input.dragging = true;
      input.lastX = event.clientX;
      input.lastY = event.clientY;
    } else if (event.button === 2) {
      input.rightDown = true;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) {
      input.mouseDown = false;
      input.dragging = false;
    } else if (event.button === 2) {
      input.rightDown = false;
    }
  }

  function onLockChange() {
    input.locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', onLockChange);

  /** Ask for pointer lock so the mouse steers the camera (click to grab). */
  input.requestLock = () => {
    if (!input.locked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  };

  input.exitLock = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };

  input.isDown = (code) => input.keys.has(code);
  input.justPressed = (code) => input.pressed.has(code);

  /** Any of the given codes held down. */
  input.anyDown = (...codes) => codes.some((c) => input.keys.has(c));

  /** Movement axes from WASD/arrows: x = strafe right, y = forward. */
  input.moveAxes = () => {
    let x = 0;
    let y = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y += 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y -= 1;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
    return { x, y };
  };

  /** Clear per-frame edges; call once per frame after the update. */
  input.endFrame = () => {
    input.pressed.clear();
    input.mouseDX = 0;
    input.mouseDY = 0;
    input.mouseClicked = false;
  };

  return input;
}
