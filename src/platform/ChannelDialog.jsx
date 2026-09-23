import React, {useState} from 'react';
import {Eye, EyeOff, Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {api} from '@/services/apiClient';

export const editableChannel = channel => ({
    name: channel.name, base_url: channel.base_url, key_env: channel.key_env,
    concurrency: channel.concurrency, asset_hosts: channel.asset_hosts, active: channel.active,
});

export default function ChannelDialog({channel, onClose, onSaved}) {
    const [name, setName] = useState(channel?.name || '');
    const [baseUrl, setBaseUrl] = useState(channel?.base_url || 'https://');
    const [apiKey, setApiKey] = useState('');
    const [visible, setVisible] = useState(false);
    const [concurrency, setConcurrency] = useState(channel?.concurrency ?? 2);
    const [hosts, setHosts] = useState((channel?.asset_hosts || []).join('\n'));
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const change = setter => event => {setter(event.target.value); setResult(null); setError('');};
    const saved = channel?.credential_configured;
    async function test() {
        setBusy('test'); setError(''); setResult(null);
        try {
            setResult(await api('/admin/channels/test', {method: 'POST', body: {
                base_url: baseUrl.trim(), ...(channel?.id ? {channel_id: channel.id} : {}),
                ...(apiKey.trim() ? {api_key: apiKey.trim()} : {}),
            }}));
        } catch (e) {setError(e.message);} finally {setBusy('');}
    }
    async function save(event) {
        event.preventDefault(); setBusy('save'); setError('');
        try {
            const body = {
                name: name.trim(), base_url: baseUrl.trim(), concurrency: Number(concurrency),
                asset_hosts: hosts.split(/[\n,]/).map(host => host.trim()).filter(Boolean),
                active: channel?.active ?? true,
                ...(channel?.key_env ? {key_env: channel.key_env} : {}),
                ...(apiKey.trim() ? {api_key: apiKey.trim()} : {}),
            };
            await api(channel?.id ? `/admin/channels/${channel.id}` : '/admin/channels', {
                method: channel?.id ? 'PATCH' : 'POST', body,
            });
            setApiKey(''); setVisible(false); onSaved(); onClose();
        } catch (e) {setError(e.message);} finally {setBusy('');}
    }
    return <Dialog open onOpenChange={open => !open && !busy && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>{channel ? '编辑渠道' : '新增渠道'}</DialogTitle>
                <DialogDescription>配置 API 地址和密钥，保存后立即用于后续请求。</DialogDescription></DialogHeader>
            <form onSubmit={save} className="space-y-5">
                <fieldset disabled={!!busy} className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="channel-name">渠道名称</Label>
                        <Input id="channel-name" required maxLength={100} value={name} onChange={change(setName)} /></div>
                    <div className="space-y-2"><Label htmlFor="channel-url">API 地址</Label>
                        <Input id="channel-url" type="url" required value={baseUrl} onChange={change(setBaseUrl)} spellCheck={false} /></div>
                    <div className="space-y-2"><div className="flex items-center justify-between gap-3">
                        <Label htmlFor="channel-key">API Key</Label>
                        <span className="text-xs text-muted-foreground">{saved ? '•••••••• 已配置' : '未配置'}</span></div>
                        <div className="relative"><Input id="channel-key" type={visible ? 'text' : 'password'} value={apiKey}
                            onChange={change(setApiKey)} autoComplete="new-password" spellCheck={false} maxLength={4096}
                            placeholder={saved ? '留空保留原密钥，输入新密钥可替换' : '粘贴供应商 API Key'} className="pr-11" />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10"
                                aria-label={visible ? '隐藏输入的密钥' : '显示输入的密钥'} disabled={!apiKey}
                                onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</Button></div>
                        <p className="text-xs leading-relaxed text-muted-foreground">密钥加密保存，不回显原文。留空不会清除已有密钥。</p></div>
                    <details className="rounded-lg border px-3 py-2.5"><summary className="cursor-pointer text-sm">高级设置</summary>
                        <div className="mt-4 space-y-4"><div className="space-y-2"><Label htmlFor="channel-concurrency">最大并发</Label>
                            <Input id="channel-concurrency" type="number" min={1} max={20} required value={concurrency} onChange={change(setConcurrency)} /></div>
                            <div className="space-y-2"><Label htmlFor="channel-hosts">输出素材域名</Label>
                                <Textarea id="channel-hosts" rows={3} value={hosts} onChange={change(setHosts)} placeholder="每行一个域名" /></div></div>
                    </details>
                </fieldset>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                {result && <p role={result.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${result.ok ? 'text-foreground' : 'text-destructive'}`}>{result.message}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                    <Button type="button" variant="outline" disabled={!!busy || !baseUrl.trim() || (!apiKey.trim() && !saved)} onClick={test}>
                        {busy === 'test' && <Loader2 size={15} className="animate-spin"/>}{busy === 'test' ? '测试中…' : '测试连接'}</Button>
                    <div className="flex gap-2"><Button type="button" variant="ghost" disabled={!!busy} onClick={onClose}>取消</Button>
                        <Button type="submit" disabled={!!busy}>{busy === 'save' ? '保存中…' : '保存'}</Button></div>
                </div>
            </form>
        </DialogContent>
    </Dialog>;
}
