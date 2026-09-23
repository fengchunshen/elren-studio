// Radix controls are not necessarily <input>s. Keep their keyboard events out of canvas shortcuts.
export function isUiShortcutTarget(target) {
    return Boolean(target?.isContentEditable || target?.closest?.(
        'input, textarea, select, video[controls], audio[controls], [contenteditable="true"], [data-node-inspector], .lightbox-overlay, [role="checkbox"], [role="switch"], [role="slider"], [role="menu"], [role="menuitem"], [role="dialog"]',
    ));
}
