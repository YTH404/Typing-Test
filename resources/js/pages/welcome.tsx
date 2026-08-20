import { Head } from '@inertiajs/react';

import { TypingTestApp } from '@/features/typing-test';

export default function Welcome() {
    return (
        <>
            <Head title="Typing Test">
                <meta
                    name="description"
                    content="A focused, private QWERTY and Colemak typing trainer with timed and timeless practice modes."
                />
            </Head>
            <TypingTestApp />
        </>
    );
}
