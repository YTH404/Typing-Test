import { describe, expect, it } from 'vitest';

import {
    KEYBOARD_TOKENS,
    PHYSICAL_LAYOUTS,
    mapPhysicalKeyboardEvent,
} from '@/features/typing-test/core';
import type {
    KeyboardEventLike,
    KeyboardLayout,
} from '@/features/typing-test/core';

const map = (
    code: string,
    layout: KeyboardLayout = 'qwerty',
    overrides: Partial<KeyboardEventLike> = {},
) =>
    mapPhysicalKeyboardEvent(
        {
            code,
            getModifierState: () => false,
            ...overrides,
        },
        layout,
    );

const character = (value: string) => ({ kind: 'character', value });

describe('physical keyboard mapping', () => {
    it('maps the full QWERTY letter block by physical code', () => {
        Object.entries(PHYSICAL_LAYOUTS.qwerty).forEach(([code, value]) => {
            expect(map(code)).toEqual(character(value));
        });
    });

    it('maps every classic Colemak position', () => {
        const expected = {
            KeyQ: 'q',
            KeyW: 'w',
            KeyE: 'f',
            KeyR: 'p',
            KeyT: 'g',
            KeyY: 'j',
            KeyU: 'l',
            KeyI: 'u',
            KeyO: 'y',
            KeyP: ';',
            KeyA: 'a',
            KeyS: 'r',
            KeyD: 's',
            KeyF: 't',
            KeyG: 'd',
            KeyH: 'h',
            KeyJ: 'n',
            KeyK: 'e',
            KeyL: 'i',
            Semicolon: 'o',
            KeyZ: 'z',
            KeyX: 'x',
            KeyC: 'c',
            KeyV: 'v',
            KeyB: 'b',
            KeyN: 'k',
            KeyM: 'm',
        };

        expect(PHYSICAL_LAYOUTS.colemak).toEqual(expected);

        Object.entries(expected).forEach(([code, value]) => {
            expect(map(code, 'colemak')).toEqual(character(value));
        });
    });

    it.each([
        ['Backquote', '`', '~'],
        ['Digit1', '1', '!'],
        ['Digit2', '2', '@'],
        ['Digit3', '3', '#'],
        ['Digit4', '4', '$'],
        ['Digit5', '5', '%'],
        ['Digit6', '6', '^'],
        ['Digit7', '7', '&'],
        ['Digit8', '8', '*'],
        ['Digit9', '9', '('],
        ['Digit0', '0', ')'],
        ['Minus', '-', '_'],
        ['Equal', '=', '+'],
        ['BracketLeft', '[', '{'],
        ['BracketRight', ']', '}'],
        ['Backslash', '\\', '|'],
        ['Quote', "'", '"'],
        ['Comma', ',', '<'],
        ['Period', '.', '>'],
        ['Slash', '/', '?'],
    ])('maps %s and its shifted symbol', (code, normal, shifted) => {
        expect(map(code)).toEqual(character(normal));
        expect(map(code, 'qwerty', { shiftKey: true })).toEqual(
            character(shifted),
        );
        expect(map(code, 'colemak')).toEqual(character(normal));
    });

    it('maps Semicolon normally in QWERTY and as O in Colemak', () => {
        expect(map('Semicolon')).toEqual(character(';'));
        expect(map('Semicolon', 'qwerty', { shiftKey: true })).toEqual(
            character(':'),
        );
        expect(map('Semicolon', 'colemak')).toEqual(character('o'));
        expect(map('Semicolon', 'colemak', { shiftKey: true })).toEqual(
            character('O'),
        );
    });

    it('maps Colemak KeyP to semicolon and colon regardless of Caps Lock', () => {
        expect(map('KeyP', 'colemak')).toEqual(character(';'));
        expect(map('KeyP', 'colemak', { shiftKey: true })).toEqual(
            character(':'),
        );
        expect(
            map('KeyP', 'colemak', {
                getModifierState: (key) => key === 'CapsLock',
            }),
        ).toEqual(character(';'));
    });

    it('uses Shift XOR Caps Lock for logical letters', () => {
        const capsLock = {
            getModifierState: (key: string) => key === 'CapsLock',
        };

        expect(map('KeyA')).toEqual(character('a'));
        expect(map('KeyA', 'qwerty', { shiftKey: true })).toEqual(
            character('A'),
        );
        expect(map('KeyA', 'qwerty', capsLock)).toEqual(character('A'));
        expect(map('KeyA', 'qwerty', { ...capsLock, shiftKey: true })).toEqual(
            character('a'),
        );

        expect(map('KeyE', 'colemak', capsLock)).toEqual(character('F'));
        expect(map('KeyE', 'colemak', { ...capsLock, shiftKey: true })).toEqual(
            character('f'),
        );
    });

    it('exposes Space, Backspace, and Escape as semantic tokens', () => {
        expect(map('Space')).toBe(KEYBOARD_TOKENS.space);
        expect(map('Backspace')).toBe(KEYBOARD_TOKENS.backspace);
        expect(map('Escape')).toBe(KEYBOARD_TOKENS.escape);
    });

    it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
        'ignores %s shortcuts',
        (modifier) => {
            expect(map('KeyA', 'qwerty', { [modifier]: true })).toBeNull();
        },
    );

    it('ignores composition and repeated printable/control input', () => {
        expect(map('KeyA', 'qwerty', { isComposing: true })).toBeNull();
        expect(map('KeyA', 'qwerty', { repeat: true })).toBeNull();
        expect(map('Space', 'qwerty', { repeat: true })).toBeNull();
        expect(map('Escape', 'qwerty', { repeat: true })).toBeNull();
    });

    it('allows repeated Backspace for press-and-hold correction', () => {
        expect(map('Backspace', 'qwerty', { repeat: true })).toBe(
            KEYBOARD_TOKENS.backspace,
        );
    });

    it.each([
        ['Numpad0', '0'],
        ['Numpad9', '9'],
        ['NumpadDecimal', '.'],
        ['NumpadAdd', '+'],
        ['NumpadSubtract', '-'],
        ['NumpadMultiply', '*'],
        ['NumpadDivide', '/'],
    ])('supports %s as a printable physical key', (code, value) => {
        expect(map(code)).toEqual(character(value));
    });

    it('ignores non-printable and unmapped keys', () => {
        expect(map('Enter')).toBeNull();
        expect(map('Tab')).toBeNull();
        expect(map('ArrowLeft')).toBeNull();
        expect(map('F1')).toBeNull();
    });
});
