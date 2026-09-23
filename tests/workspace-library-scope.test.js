import { expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ user: { id: 'account-a' }, project: { id: 'project-one' } }));
vi.mock('@/services/platformContext', () => ({ platformEnabled: true, getPlatformContext: () => session }));
import { libraryScope, saveLibraryEntry } from '@/services/workspaceLibrary';

it('shares a personal library between the same user’s projects and rejects writes after account switching', async () => {
    const owner = libraryScope();
    session.project = { id: 'project-two' };
    expect(libraryScope()).toBe(owner);
    session.user = { id: 'account-b' };
    expect(libraryScope()).not.toBe(owner);
    await expect(saveLibraryEntry({ kind: 'asset', name: 'test', url: 'data:image/png;base64,eA==' }, owner)).rejects.toThrow('账号已切换');
});
