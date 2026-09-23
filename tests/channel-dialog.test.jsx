import React from 'react';
import {beforeEach, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import ChannelDialog from '@/platform/ChannelDialog';
import {api} from '@/services/apiClient';

vi.mock('@/services/apiClient', () => ({api: vi.fn()}));
const channel = {id: 'c1', name: 'DeepSeek', base_url: 'https://api.deepseek.com', key_env: 'ELREN_PROVIDER_DEEPSEEK',
    active: true, concurrency: 2, asset_hosts: [], credential_configured: true};
beforeEach(() => {api.mockReset(); api.mockResolvedValue({ok: true, message: '连接成功'});});

it('never prefills a stored key and preserves it on metadata save', async () => {
    const onSaved = vi.fn(), onClose = vi.fn();
    render(<ChannelDialog channel={channel} onSaved={onSaved} onClose={onClose}/>);
    const input = screen.getByLabelText('API Key');
    expect(input.type).toBe('password'); expect(input.value).toBe('');
    expect(screen.queryByText('服务端凭据引用')).toBeNull();
    fireEvent.change(screen.getByLabelText('渠道名称'), {target: {value: 'DeepSeek 官方'}});
    fireEvent.click(screen.getByRole('button', {name: '保存', exact: true}));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [path, {body}] = api.mock.calls[0];
    expect(path).toBe('/admin/channels/c1');
    expect(body).not.toHaveProperty('api_key');
    expect(body.name).toBe('DeepSeek 官方');
    expect(body).not.toHaveProperty('credential_configured');
    expect(onClose).toHaveBeenCalled();
});

it('tests unsaved values without saving and invalidates stale test feedback', async () => {
    render(<ChannelDialog channel={channel} onSaved={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('API Key'), {target: {value: 'sk-test-only-value'}});
    fireEvent.click(screen.getByRole('button', {name: '测试连接'}));
    expect((await screen.findByRole('status')).textContent).toContain('连接成功');
    expect(api).toHaveBeenCalledWith('/admin/channels/test', {method: 'POST', body: {
        channel_id: 'c1', base_url: 'https://api.deepseek.com', api_key: 'sk-test-only-value',
    }});
    fireEvent.change(screen.getByLabelText('API 地址'), {target: {value: 'https://new.example'}});
    expect(screen.queryByRole('status')).toBeNull();
});

it('shows connection failures and retains typed key on save failure', async () => {
    api.mockResolvedValueOnce({ok: false, message: '认证未通过'}).mockRejectedValueOnce(new Error('保存失败'));
    const onClose = vi.fn();
    render(<ChannelDialog channel={channel} onSaved={vi.fn()} onClose={onClose}/>);
    fireEvent.change(screen.getByLabelText('API Key'), {target: {value: 'sk-test-only-value'}});
    fireEvent.click(screen.getByRole('button', {name: '测试连接'}));
    expect((await screen.findByRole('alert')).textContent).toContain('认证未通过');
    fireEvent.click(screen.getByRole('button', {name: '保存', exact: true}));
    await screen.findByText('保存失败');
    expect(screen.getByLabelText('API Key').value).toBe('sk-test-only-value');
    expect(onClose).not.toHaveBeenCalled();
});

it('new channel saves a write-only key without requiring an environment variable', async () => {
    const onSaved = vi.fn();
    render(<ChannelDialog onSaved={onSaved} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('渠道名称'), {target: {value: 'New'}});
    fireEvent.change(screen.getByLabelText('API 地址'), {target: {value: 'https://provider.example'}});
    fireEvent.change(screen.getByLabelText('API Key'), {target: {value: 'sk-test-only-value'}});
    fireEvent.click(screen.getByRole('button', {name: '保存', exact: true}));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.mock.calls[0][1].body.api_key).toBe('sk-test-only-value');
    expect(api.mock.calls[0][1].body).not.toHaveProperty('key_env');
    expect(screen.getByLabelText('API Key').value).toBe('');
});
