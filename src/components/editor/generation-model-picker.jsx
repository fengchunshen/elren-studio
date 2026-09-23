import React, { useRef } from 'react';
import { AudioLines, Box, Check, ChevronDown, Diamond, Image, SlidersHorizontal, Type, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { modelBadges, modelKey, modelName } from '@/lib/generation-models';
import { cn } from '@/lib/utils';

const icons = { text: Type, image: Image, video: Video, audio: AudioLines, model: Box };
const names = { text: '文字', image: '图片', video: '视频', audio: '音频', model: '3D' };
const stop = event => event.stopPropagation();
const redundantBadges = new Set(['图片参考', '图片编辑', '文生图', '多模态参考', '视频参考', '音频参考']);
const menuDetails = model => [...new Set(modelBadges(model))].filter(badge => !redundantBadges.has(badge)).slice(0, 2);

export function GenerationModelPicker({ models = [], value, onChange, onSettings, kind = 'image', label = '生成模型', settingsLabel = '管理模型' }) {
    const trigger = useRef(null), openingSettings = useRef(false);
    const current = models.find(item => modelKey(item) === value), Icon = icons[kind] || Image;
    return <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button ref={trigger} type="button" variant="ghost" aria-label={label}
            className="h-9 min-w-0 max-w-full gap-2 rounded-lg px-2 text-sm data-[state=open]:bg-foreground/5 sm:max-w-[300px]">
            <Icon size={16} className="shrink-0 text-muted-foreground" /><span className="truncate">{modelName(current) || `选择${names[kind] || ''}模型`}</span>{current?.tags?.[0] && <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{current.tags[0]}</span>}<ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={6} collisionPadding={12} aria-label={label}
            onCloseAutoFocus={event => { if (openingSettings.current) { event.preventDefault(); openingSettings.current = false; } }}
            className="generation-floating-surface w-[280px] max-w-[calc(100vw-24px)] rounded-2xl border-border/50 bg-muted p-1.5 shadow-md"
            onMouseDown={stop} onMouseUp={stop} onClick={stop} onDoubleClick={stop} onWheel={stop} onKeyDown={stop}>
            <div className="max-h-[min(420px,calc(var(--radix-dropdown-menu-content-available-height)-24px))] space-y-1 overflow-y-auto">
                {models.map(item => {
                    const selected = modelKey(item) === value, badges = menuDetails(item);
                    return <DropdownMenuItem key={modelKey(item)} role="menuitemradio" aria-checked={selected} textValue={modelName(item)}
                        aria-description={item.description || undefined}
                        className={cn('min-h-[56px] gap-3 rounded-xl px-2.5 py-2 focus:bg-foreground/[0.06]', selected && 'bg-foreground/[0.09] focus:bg-foreground/[0.09]')}
                        onSelect={() => onChange(modelKey(item))}>
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2"><Icon size={16} strokeWidth={1.7} className="shrink-0 text-muted-foreground" /><span className="truncate text-sm font-medium leading-5">{modelName(item)}</span></div>
                            {badges.length > 0 && <div className="flex items-center gap-2 pl-6">{badges.map(badge => /^(?:\d+(?:\.\d+)?[KP]|\d+[x×]\d+|自动规格)$/i.test(badge)
                                ? <span key={badge} className="inline-flex h-5 items-center gap-1 rounded-full bg-foreground/5 px-1.5 text-[11px] leading-none text-muted-foreground"><Diamond size={11} strokeWidth={1.5} />{badge}</span>
                                : <span key={badge} className="truncate text-[11px] leading-5 text-muted-foreground">{badge}</span>)}</div>}
                        </div><Check size={16} strokeWidth={1.8} aria-hidden="true" className={cn('mr-1 shrink-0', !selected && 'invisible')} />
                    </DropdownMenuItem>;
                })}
                {!models.length && <div role="status" className="px-3 py-5 text-center text-sm text-muted-foreground">暂无可用的{names[kind] || ''}模型</div>}
            </div>
            {onSettings && <><DropdownMenuSeparator className="mx-1 bg-border/60" /><DropdownMenuItem aria-label={settingsLabel} className="rounded-xl px-3 text-xs text-muted-foreground" onSelect={() => { openingSettings.current = true; trigger.current?.focus({ preventScroll: true }); onSettings(); }}><SlidersHorizontal size={14} />管理模型</DropdownMenuItem></>}
        </DropdownMenuContent>
    </DropdownMenu>;
}
