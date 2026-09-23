import { createContext, useContext, useLayoutEffect, useRef } from 'react';

export const ElrenLoadingContext = createContext(null);

export function useElrenLoading(active, label = '正在加载工作空间…') {
    const update = useContext(ElrenLoadingContext);
    const token = useRef({});
    useLayoutEffect(() => {
        if (!update || !active) return;
        update(token.current, label);
        return () => update(token.current, null);
    }, [active, label, update]);
    return Boolean(update);
}
