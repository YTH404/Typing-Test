import { PHYSICAL_LAYOUTS } from '../core/keyboard';
import type { KeyboardLayout } from '../core/types';

type VirtualKeyboardProps = {
    layout: KeyboardLayout;
    activeCode: string | null;
};

type KeyDefinition = {
    code: string;
    label?: string;
    size?: 'wide' | 'wider' | 'space';
};

const rows: readonly (readonly KeyDefinition[])[] = [
    [
        { code: 'Backquote', label: '`' },
        ...Array.from({ length: 10 }, (_, index) => ({
            code: `Digit${(index + 1) % 10}`,
            label: String((index + 1) % 10),
        })),
        { code: 'Minus', label: '-' },
        { code: 'Equal', label: '=' },
        { code: 'Backspace', label: 'backspace', size: 'wider' as const },
    ],
    [
        { code: 'Tab', label: 'tab', size: 'wide' },
        ...'QWERTYUIOP'.split('').map((letter) => ({
            code: `Key${letter}`,
        })),
        { code: 'BracketLeft', label: '[' },
        { code: 'BracketRight', label: ']' },
        { code: 'Backslash', label: '\\', size: 'wide' },
    ],
    [
        { code: 'CapsLock', label: 'caps', size: 'wider' },
        ...'ASDFGHJKL'.split('').map((letter) => ({
            code: `Key${letter}`,
        })),
        { code: 'Semicolon' },
        { code: 'Quote', label: "'" },
        { code: 'Enter', label: 'enter', size: 'wider' },
    ],
    [
        { code: 'ShiftLeft', label: 'shift', size: 'wider' },
        ...'ZXCVBNM'.split('').map((letter) => ({
            code: `Key${letter}`,
        })),
        { code: 'Comma', label: ',' },
        { code: 'Period', label: '.' },
        { code: 'Slash', label: '/' },
        { code: 'ShiftRight', label: 'shift', size: 'wider' },
    ],
    [
        { code: 'ControlLeft', label: 'ctrl', size: 'wide' },
        { code: 'AltLeft', label: 'alt', size: 'wide' },
        { code: 'Space', label: 'space', size: 'space' },
        { code: 'AltRight', label: 'alt', size: 'wide' },
        { code: 'ControlRight', label: 'ctrl', size: 'wide' },
    ],
];

const getLabel = (key: KeyDefinition, layout: KeyboardLayout): string => {
    if (key.label !== undefined) {
        return key.label;
    }

    return PHYSICAL_LAYOUTS[layout][key.code] ?? key.code.replace('Key', '');
};

export function VirtualKeyboard({ layout, activeCode }: VirtualKeyboardProps) {
    return (
        <div
            className="virtual-keyboard"
            aria-hidden="true"
            data-testid="virtual-keyboard"
        >
            {rows.map((row, rowIndex) => (
                <div className="keyboard-row" key={rowIndex}>
                    {row.map((key) => {
                        const classes = ['keyboard-key'];

                        if (key.size !== undefined) {
                            classes.push(`keyboard-key--${key.size}`);
                        }

                        if (activeCode === key.code) {
                            classes.push('keyboard-key--active');
                        }

                        return (
                            <span className={classes.join(' ')} key={key.code}>
                                {getLabel(key, layout)}
                            </span>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
