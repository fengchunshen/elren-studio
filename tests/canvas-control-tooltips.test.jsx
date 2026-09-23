import React, { createRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CanvasControls } from '@/components/editor/canvas-controls';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: value => value }) }));

function Harness() {
    const [preferences, setPreferences] = useState({ minimap: true, connections: true, snap: false });
    return <CanvasControls canvasRef={createRef()} nodes={[]} view={{ x: 0, y: 0, zoom: 1 }} onViewChange={() => {}}
        preferences={preferences} onPreferencesChange={setPreferences} selectedIds={new Set()} />;
}

it('dismisses the minimap hint on click even while the button retains focus', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '关闭小地图' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(document.activeElement).toBe(button);
    await user.unhover(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByRole('img', { name: '画布小地图' })).toBeNull();
}, 30000);

it('closes on pointer exit and still supports keyboard focus and Escape', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '关闭小地图' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await user.unhover(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    await user.tab(); // minimap
    await user.tab(); // minimap toggle
    expect(document.activeElement).toBe(button);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(document.activeElement).toBe(button);
}, 30000);
