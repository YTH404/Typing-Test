export function DesktopRequirement() {
    return (
        <section
            className="desktop-requirement"
            aria-labelledby="desktop-required-heading"
        >
            <div className="desktop-requirement-card">
                <div className="desktop-requirement-icon" aria-hidden="true">
                    esc
                </div>
                <h2 id="desktop-required-heading">
                    Physical keyboard required
                </h2>
                <p>
                    This trainer maps US-ANSI key positions directly for QWERTY
                    and Colemak. Open it on a screen at least 900 pixels wide
                    with a physical keyboard to begin.
                </p>
            </div>
        </section>
    );
}
