import * as React from 'react';

// A host can temporarily suspend its overlays without unmounting the underlying editor.
export const OverlaySuspensionContext = React.createContext(false);
export const useOverlaysSuspended = () => React.useContext(OverlaySuspensionContext);

export function useOverlayState({ open, defaultOpen = false, onOpenChange }) {
    const suspended = useOverlaysSuspended();
    const [localOpen, setLocalOpen] = React.useState(defaultOpen);
    const current = open ?? localOpen;
    const change = React.useCallback(next => {
        setLocalOpen(next);
        onOpenChange?.(next);
    }, [onOpenChange]);
    React.useLayoutEffect(() => { if (suspended && current) change(false); }, [suspended, current, change]);
    return { open: !suspended && current, onOpenChange: change };
}
