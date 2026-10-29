import React, { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

function ReferenceVideo({ src, resolveMedia, className }) {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let disposed = false;
        setUrl(''); setFailed(false);
        Promise.resolve(resolveMedia ? resolveMedia(src) : src).then(value => {
            if (!disposed) setUrl(value || '');
        }).catch(() => { if (!disposed) setFailed(true); });
        return () => { disposed = true; };
    }, [src, resolveMedia]);
    return url && !failed
        ? <video src={url} className={className} muted playsInline preload="metadata" onError={() => setFailed(true)} />
        : <Video className="h-5 w-5 text-muted-foreground" />;
}

export default function AgentReference({ reference, onRemove, disabled, ImageComponent = 'img', resolveMedia }) {
    const [open, setOpen] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    useEffect(() => setImageFailed(false), [reference.preview_url]);
    const video = reference.preview_video_url;
    const image = reference.preview_url && !imageFailed;
    const Icon = video || reference.media_types?.includes('video') ? Video
        : reference.media_types?.includes('image') ? ImageIcon : FileText;
    const media = (preview = false) => {
        const className = preview ? 'h-60 w-full object-contain' : 'h-full w-full object-cover';
        if (reference.missing) return <Icon className="h-5 w-5 text-muted-foreground" />;
        if (video && (preview || !image)) return <ReferenceVideo src={video} resolveMedia={resolveMedia} className={className} />;
        if (image) return <ImageComponent src={reference.preview_url} alt="" className={className} onError={() => setImageFailed(true)} />;
        return <Icon className="h-5 w-5 text-muted-foreground" />;
    };
    const text = reference.text || reference.prompt;
    return <div role="group" aria-label={`引用：${reference.title}`} className="agent-reference relative h-10 w-10 shrink-0">
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <Button type="button" variant="outline" aria-label={`预览引用：${reference.title}`} aria-expanded={open}
                    className={`h-10 w-10 overflow-hidden rounded-lg p-0 ${reference.missing ? 'border-destructive/50' : 'bg-muted/40'}`}
                    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
                    onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
                    onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
                    {media()}
                </Button>
            </PopoverAnchor>
            <PopoverContent side="top" sideOffset={10} align="center" aria-label={`引用预览：${reference.title}`}
                style={{animation:'none'}}
                className={`agent-reference-preview pointer-events-none overflow-hidden p-0 shadow-md ${image || video ? 'w-80' : 'w-56'} max-w-[calc(100vw-24px)]`}
                onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
                {reference.missing ? <p className="p-3 text-sm text-muted-foreground">来源节点已删除，请移除此引用</p>
                    : image || video ? <div className="flex h-60 items-center justify-center bg-muted/40">{media(true)}</div>
                        : <p className="max-h-44 overflow-hidden whitespace-pre-wrap break-words p-3 text-sm leading-5">{text || '暂无内容'}</p>}
                <p className="border-t border-border bg-muted/60 px-3 py-2 text-xs font-medium break-words">{reference.title}</p>
            </PopoverContent>
        </Popover>
        {onRemove && <Button type="button" variant="secondary" size="icon" disabled={disabled}
            aria-label={`移除引用：${reference.title}`} className="agent-reference-remove absolute -right-1.5 -top-1.5 z-10 h-4 w-4 rounded-full border border-border p-0"
            onMouseEnter={() => setOpen(false)} onFocus={() => setOpen(false)} onClick={() => {setOpen(false);onRemove();}}><X className="h-3 w-3" /></Button>}
    </div>;
}
