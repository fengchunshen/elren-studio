import * as React from 'react';
import { useDismissableLayerSurface } from '@radix-ui/react-dismissable-layer';

// Canvas surfaces stop mouse events to protect dragging/selection. Let Radix
// dismiss outside interactions on these surfaces without removing that protection.
// Portalled children still use Radix's React-tree checks for nested menus.
export function useOverlayDismissSurface(ref) {
    const register = useDismissableLayerSurface();
    return React.useCallback(node => {
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
        register(node);
    }, [ref, register]);
}
