import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSidebar } from '@/components/editor/workspace-sidebar';
import { WorkflowTemplateCard } from '@/components/editor/workflow-template-card';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: value => value }) }));
vi.mock('@/services/platformContext', () => ({ platformEnabled: false, getPlatformContext: () => null }));
vi.mock('@/services/workspaceLibrary', () => ({
    libraryScope: () => 'test-user', listLibraryEntries: async () => [],
    saveLibraryEntry: vi.fn(), removeLibraryEntry: vi.fn(),
}));

it('previews without inserting, returns to the filtered gallery, then applies exactly once', async () => {
    const insert = vi.fn();
    function Harness() {
        const [panel, setPanel] = useState('templates');
        return <WorkspaceSidebar panel={panel} onPanelChange={setPanel} nodes={[]} history={[]} selectedCount={0}
            onInsertWorkflow={workflow => { insert(workflow); setPanel(null); }} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: '搜索模板' }), '图生视频');
    const view = screen.getByRole('button', { name: '查看模板：图生视频' });
    await user.click(view);
    expect(await screen.findByRole('heading', { name: '图生视频' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '图生视频的节点与连线' })).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('heading', { name: '图生视频' })).toBeNull());
    expect(screen.getByRole('textbox', { name: '搜索模板' }).value).toBe('图生视频');
    await waitFor(() => expect(document.activeElement).toBe(view));
    await user.click(view);
    await user.click(screen.getByRole('button', { name: '应用到画布' }));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ id: 'builtin-video' });
    expect(screen.queryByRole('textbox', { name: '搜索模板' })).toBeNull();
});

it('uses saved workflow media as the cover and shows its actual graph if media cannot load', () => {
    const workflow = { id: 'personal', name: '自存模板', nodes: [
        { id: 'image', type: 'input-image', content: '/saved-image.png', x: 0, y: 0 },
    ], connections: [] };
    const apply = vi.fn();
    render(<WorkflowTemplateCard workflow={workflow} onApply={apply} />);
    const cover = screen.getByRole('img', { name: '自存模板封面' });
    expect(cover.getAttribute('src')).toBe('/saved-image.png');
    fireEvent.error(cover);
    expect(screen.getByRole('img', { name: '自存模板的节点与连线' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '应用模板：自存模板' }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(workflow);
});
