import { KEYBOARD_TOKENS } from './types';
import type {
    CharacterInput,
    KeyboardEventLike,
    KeyboardInput,
    KeyboardLayout,
} from './types';

type KeyPair = readonly [normal: string, shifted: string];

const ANSI_SYMBOL_KEYS: Readonly<Record<string, KeyPair>> = {
    Backquote: ['`', '~'],
    Digit1: ['1', '!'],
    Digit2: ['2', '@'],
    Digit3: ['3', '#'],
    Digit4: ['4', '$'],
    Digit5: ['5', '%'],
    Digit6: ['6', '^'],
    Digit7: ['7', '&'],
    Digit8: ['8', '*'],
    Digit9: ['9', '('],
    Digit0: ['0', ')'],
    Minus: ['-', '_'],
    Equal: ['=', '+'],
    BracketLeft: ['[', '{'],
    BracketRight: [']', '}'],
    Backslash: ['\\', '|'],
    Quote: ["'", '"'],
    Comma: [',', '<'],
    Period: ['.', '>'],
    Slash: ['/', '?'],
};

const QWERTY_LETTERS: Readonly<Record<string, string>> = {
    KeyQ: 'q',
    KeyW: 'w',
    KeyE: 'e',
    KeyR: 'r',
    KeyT: 't',
    KeyY: 'y',
    KeyU: 'u',
    KeyI: 'i',
    KeyO: 'o',
    KeyP: 'p',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    KeyF: 'f',
    KeyG: 'g',
    KeyH: 'h',
    KeyJ: 'j',
    KeyK: 'k',
    KeyL: 'l',
    Semicolon: ';',
    KeyZ: 'z',
    KeyX: 'x',
    KeyC: 'c',
    KeyV: 'v',
    KeyB: 'b',
    KeyN: 'n',
    KeyM: 'm',
};

const COLEMAK_KEYS: Readonly<Record<string, string>> = {
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

const NUMPAD_KEYS: Readonly<Record<string, string>> = {
    Numpad0: '0',
    Numpad1: '1',
    Numpad2: '2',
    Numpad3: '3',
    Numpad4: '4',
    Numpad5: '5',
    Numpad6: '6',
    Numpad7: '7',
    Numpad8: '8',
    Numpad9: '9',
    NumpadDecimal: '.',
    NumpadAdd: '+',
    NumpadSubtract: '-',
    NumpadMultiply: '*',
    NumpadDivide: '/',
};

const character = (value: string): CharacterInput => ({
    kind: 'character',
    value,
});

const isAsciiLetter = (value: string): boolean => /^[a-z]$/i.test(value);

const resolveLayoutKey = (
    code: string,
    layout: KeyboardLayout,
): string | null => {
    const mapping = layout === 'colemak' ? COLEMAK_KEYS : QWERTY_LETTERS;

    return mapping[code] ?? null;
};

/**
 * Converts a physical US-ANSI key code to an app-managed QWERTY/Colemak
 * character. It intentionally ignores the operating system's logical key.
 */
export function mapPhysicalKeyboardEvent(
    event: KeyboardEventLike,
    layout: KeyboardLayout,
): KeyboardInput | null {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
        return null;
    }

    if (event.repeat && event.code !== 'Backspace') {
        return null;
    }

    if (event.code === 'Backspace') {
        return KEYBOARD_TOKENS.backspace;
    }

    if (event.code === 'Escape') {
        return KEYBOARD_TOKENS.escape;
    }

    if (event.code === 'Space') {
        return KEYBOARD_TOKENS.space;
    }

    const layoutValue = resolveLayoutKey(event.code, layout);

    if (layoutValue !== null) {
        if (isAsciiLetter(layoutValue)) {
            const capsLock = event.getModifierState?.('CapsLock') ?? false;
            const uppercase = Boolean(event.shiftKey) !== capsLock;

            return character(
                uppercase ? layoutValue.toUpperCase() : layoutValue,
            );
        }

        if (layoutValue === ';') {
            return character(event.shiftKey ? ':' : ';');
        }
    }

    const symbolPair = ANSI_SYMBOL_KEYS[event.code];

    if (symbolPair !== undefined) {
        return character(symbolPair[event.shiftKey ? 1 : 0]);
    }

    const numpadValue = NUMPAD_KEYS[event.code];

    return numpadValue === undefined ? null : character(numpadValue);
}

export const PHYSICAL_LAYOUTS = {
    qwerty: QWERTY_LETTERS,
    colemak: COLEMAK_KEYS,
} as const;
