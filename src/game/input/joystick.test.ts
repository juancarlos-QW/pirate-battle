import { describe, expect, it } from 'vitest';
import { joystickToInput } from './InputController.ts';

const UP = -Math.PI / 2;
const RIGHT = 0;
const DOWN = Math.PI / 2;

describe('joystickToInput', () => {
  it('does nothing when released or inside the dead zone', () => {
    const idle = { forward: false, turnLeft: false, turnRight: false };
    expect(joystickToInput(UP, null)).toEqual(idle);
    expect(joystickToInput(UP, { angle: RIGHT, strength: 0.1 })).toEqual(idle);
  });

  it('sails straight when the joystick points where the ship is heading', () => {
    expect(joystickToInput(UP, { angle: UP, strength: 1 })).toEqual({
      forward: true,
      turnLeft: false,
      turnRight: false,
    });
  });

  it('turns the shortest way toward the joystick direction', () => {
    // Heading up, joystick right: clockwise on screen, i.e. turn right.
    expect(joystickToInput(UP, { angle: RIGHT, strength: 1 })).toMatchObject({
      forward: true,
      turnRight: true,
      turnLeft: false,
    });
    // Heading down, joystick right: counter-clockwise, i.e. turn left.
    expect(joystickToInput(DOWN, { angle: RIGHT, strength: 1 })).toMatchObject({
      turnLeft: true,
      turnRight: false,
    });
  });

  it('handles directions across the ±π boundary', () => {
    // Heading just below π, joystick just above -π: they are almost the same direction.
    expect(joystickToInput(Math.PI - 0.02, { angle: -Math.PI + 0.02, strength: 1 })).toMatchObject({
      turnLeft: false,
      turnRight: false,
    });
  });
});
