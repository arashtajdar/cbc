/**
 * Sets up global input event handlers
 */
window.setupInputHandling = function () {
    const keyMap = {
        KeyW: 'w',
        w: 'w',
        W: 'w',
        KeyA: 'a',
        a: 'a',
        A: 'a',
        KeyS: 's',
        s: 's',
        S: 's',
        KeyD: 'd',
        d: 'd',
        D: 'd',
        ArrowUp: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        Space: 'Space',
        ' ': 'Space'
    };

    window.addEventListener('keydown', e => {
        const key = keyMap[e.code] || keyMap[e.key];
        if (key && window.engine.inputs[key] !== undefined) {
            window.engine.inputs[key] = true;

            // Dispatch dynamic UI update event
            window.dispatchEvent(
                new CustomEvent('engine-input-change', { detail: { key, pressed: true } })
            );

            // Prevent browser scroll behavior for gameplay controls
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(key)) {
                e.preventDefault();
            }
        }
    });

    window.addEventListener('keyup', e => {
        const key = keyMap[e.code] || keyMap[e.key];
        if (key && window.engine.inputs[key] !== undefined) {
            window.engine.inputs[key] = false;

            // Dispatch dynamic UI update event
            window.dispatchEvent(
                new CustomEvent('engine-input-change', { detail: { key, pressed: false } })
            );
        }
    });
};
