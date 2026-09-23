import { CONTENT_NODES, AUXILIARY_NODES, EXTENSION_NODES, DERIVED_NODES } from '@/lib/node-catalog';
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuGroup,
    ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator, ContextMenuLabel, ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const nodeItems = CONTENT_NODES;
const characterItems = EXTENSION_NODES;
const toolItems = AUXILIARY_NODES;

function NodeMenuItems({ items, Item, onAddNode, canConnect = () => true }) {
    const { t } = useTranslation();
    return items.map(([type, label]) => <Item key={type} disabled={!canConnect(type)} onSelect={() => onAddNode(type)}>{t(label)}</Item>);
}

export function CanvasContextMenu({ children, open, onOpenChange, selectionCount = 0, onSaveSelection,
    onSaveTemplate, onGroupSelection, onAddNode, onUpload, onAssets, onUndo, onRedo, onPaste, canUndo, canRedo, canPaste }) {
    const { t } = useTranslation();
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
    return (
        <ContextMenu open={open} onOpenChange={onOpenChange} modal={false}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-60" aria-label={t(selectionCount ? '节点操作' : '画布菜单')}
                onKeyDown={event => {
                    if (!(event.ctrlKey || event.metaKey)) return;
                    const key = event.key.toLowerCase();
                    const action = key === 'z' ? (event.shiftKey ? (canRedo && onRedo) : (canUndo && onUndo)) : key === 'v' ? (canPaste && onPaste) : null;
                    if (!action) return;
                    event.preventDefault();
                    event.stopPropagation();
                    action();
                    onOpenChange(false);
                }}>
                {selectionCount > 0 ? <>
                    <ContextMenuLabel>{t('已选中 {{count}} 个节点', { count: selectionCount })}</ContextMenuLabel>
                    {onGroupSelection && <ContextMenuItem onSelect={onGroupSelection}>创建命名分组<ContextMenuShortcut>{modifier}G</ContextMenuShortcut></ContextMenuItem>}
                    {onSaveTemplate && <ContextMenuItem onSelect={onSaveTemplate}>{t('保存为我的模板')}</ContextMenuItem>}
                    <ContextMenuItem onSelect={onSaveSelection}>{t('保存当前选取工作流')}</ContextMenuItem>
                    <ContextMenuSeparator />
                </> : <>
                    <ContextMenuGroup>
                        <ContextMenuItem onSelect={onUpload}>{t('上传')}</ContextMenuItem>
                        <ContextMenuItem onSelect={onAssets}>{t('添加资产')}</ContextMenuItem>
                    </ContextMenuGroup>
                    <ContextMenuSeparator />
                    <ContextMenuGroup>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger>{t('添加节点')}</ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <NodeMenuItems items={nodeItems} Item={ContextMenuItem} onAddNode={onAddNode} />
                                <ContextMenuSeparator />
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger>{t('扩展创作')}</ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-52">
                                        <NodeMenuItems items={characterItems} Item={ContextMenuItem} onAddNode={onAddNode} />
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger>{t('添加辅助工具')}</ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <NodeMenuItems items={toolItems} Item={ContextMenuItem} onAddNode={onAddNode} />
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    </ContextMenuGroup>
                    <ContextMenuSeparator />
                </>}
                <ContextMenuGroup>
                    <ContextMenuItem disabled={!canUndo} onSelect={onUndo}>{t('撤销')}<ContextMenuShortcut>{modifier}Z</ContextMenuShortcut></ContextMenuItem>
                    <ContextMenuItem disabled={!canRedo} onSelect={onRedo}>{t('重做')}<ContextMenuShortcut>⇧{modifier}Z</ContextMenuShortcut></ContextMenuItem>
                </ContextMenuGroup>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!canPaste} onSelect={onPaste}>{t('粘贴')}<ContextMenuShortcut>{modifier}V</ContextMenuShortcut></ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

// A connection can also open the node picker with a left click. Use a controlled DropdownMenu
// for that programmatic entry point; the canvas right-click uses ContextMenu's native trigger.
export function CanvasConnectionMenu({ position, onOpenChange, onAddNode, canConnect }) {
    const { t } = useTranslation();
    return (
        <DropdownMenu open={position.visible} onOpenChange={onOpenChange} modal={false}>
            {createPortal(<DropdownMenuTrigger asChild>
                <span aria-hidden="true" tabIndex={-1} className="pointer-events-none fixed h-px w-px" style={{ left: position.x, top: position.y }} />
            </DropdownMenuTrigger>, document.body)}
            <DropdownMenuContent align="start" collisionPadding={8} className="w-56 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto" aria-label={t('连接新节点')}
                onCloseAutoFocus={event => event.preventDefault()}>
                <NodeMenuItems items={nodeItems} Item={DropdownMenuItem} onAddNode={onAddNode} canConnect={canConnect} />
                <NodeMenuItems items={DERIVED_NODES} Item={DropdownMenuItem} onAddNode={onAddNode} canConnect={canConnect} />
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t('扩展创作')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent><NodeMenuItems items={characterItems} Item={DropdownMenuItem} onAddNode={onAddNode} canConnect={canConnect} /></DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t('添加辅助工具')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent><NodeMenuItems items={toolItems} Item={DropdownMenuItem} onAddNode={onAddNode} canConnect={canConnect} /></DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
