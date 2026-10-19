import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceHome } from '@/components/editor/workspace-home';
import { deleteWorkspaceProjects, listWorkspaceProjects } from '@/services/workspaceProjects';

vi.mock('@/services/workspaceProjects', () => ({ listWorkspaceProjects: vi.fn(), createWorkspaceProject: vi.fn(), renameWorkspaceProject: vi.fn(), deleteWorkspaceProjects: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const [a, b, c] = [['a', '项目 A', 3], ['b', '项目 B', 2], ['c', '项目 C', 1]].map(([id, name, updatedAt]) => ({ id, name, updatedAt }));
beforeEach(() => { listWorkspaceProjects.mockResolvedValue([a, b, c]); deleteWorkspaceProjects.mockReset(); });

it('selects projects with checkboxes and shift ranges without opening them', async () => {
    const onOpen = vi.fn(), user = userEvent.setup();
    render(<WorkspaceHome onOpen={onOpen} />);
    await user.click(await screen.findByRole('checkbox', { name: '选择项目：项目 A' }));
    expect(screen.getByRole('toolbar', { name: '已选项目操作' }).textContent).toContain('已选择 1 个项目');
    await user.keyboard('{Shift>}'); await user.click(screen.getByRole('button', { name: '切换选择：项目 C' })); await user.keyboard('{/Shift}');
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: '切换选择：项目 B' }));
    expect(screen.getByRole('toolbar').textContent).toContain('已选择 2 个项目');
    expect(screen.getByRole('button', { name: '管理项目：项目 A' }).classList.contains('invisible')).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar')).toBeNull();
    await user.click(screen.getByRole('button', { name: '打开项目：项目 B' }));
    expect(onOpen).toHaveBeenCalledWith('b');
});

it('confirms a batch delete and keeps failed projects selected for another attempt', async () => {
    deleteWorkspaceProjects.mockResolvedValue({ deleted: [a], failed: [{ project: c, error: new Error('网络错误') }] });
    const user = userEvent.setup();
    render(<WorkspaceHome onOpen={vi.fn()} />);
    await user.click(await screen.findByRole('checkbox', { name: '选择项目：项目 A' }));
    await user.click(screen.getByRole('checkbox', { name: '选择项目：项目 C' }));
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 2 个项目' });
    expect(dialog.textContent).toContain('「项目 A」、「项目 C」这 2 个项目的画布内容将被删除');
    expect(within(dialog).getByRole('button', { name: '取消' })).toBe(document.activeElement);
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(deleteWorkspaceProjects).toHaveBeenCalledWith([a, c]);
    expect(await within(screen.getByRole('dialog', { name: '删除项目' })).findByText('「项目 C」删除失败：网络错误')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('checkbox', { name: '选择项目：项目 A' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '选择项目：项目 C' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('toolbar').textContent).toContain('已选择 1 个项目');
});

it('select all covers only the projects matching the search', async () => {
    const user = userEvent.setup();
    render(<WorkspaceHome onOpen={vi.fn()} />);
    await user.click(await screen.findByRole('checkbox', { name: '选择项目：项目 A' }));
    await user.type(screen.getByRole('textbox', { name: '搜索项目' }), 'b');
    expect(screen.queryByRole('toolbar')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: '选择项目：项目 B' }));
    await user.click(screen.getByRole('button', { name: '取消全选' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
    await user.clear(screen.getByRole('textbox', { name: '搜索项目' }));
    await user.click(screen.getByRole('checkbox', { name: '选择项目：项目 C' }));
    await user.click(screen.getByRole('button', { name: '全选' }));
    expect(screen.getByRole('toolbar').textContent).toContain('已选择 3 个项目');
});
