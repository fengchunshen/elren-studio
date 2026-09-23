import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OverlaySuspensionContext } from '@/components/ui/overlay-suspension';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

it.each(['popover', 'menu'])('closes an open %s on suspension without reopening it on resume', async kind => {
    const onChange = vi.fn();
    const content = kind === 'popover' ? <Popover defaultOpen onOpenChange={onChange}><PopoverTrigger>参数</PopoverTrigger><PopoverContent aria-label="参数"><button>选项</button></PopoverContent></Popover>
        : <DropdownMenu defaultOpen onOpenChange={onChange}><DropdownMenuTrigger>参数</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>选项</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
    const role = kind === 'popover' ? 'dialog' : 'menu';
    const view = render(<OverlaySuspensionContext.Provider value={false}>{content}</OverlaySuspensionContext.Provider>);
    expect(screen.getByRole(role)).toBeTruthy();
    view.rerender(<OverlaySuspensionContext.Provider value>{content}</OverlaySuspensionContext.Provider>);
    await waitFor(() => expect(screen.queryByRole(role)).toBeNull());
    expect(onChange).toHaveBeenCalledWith(false);
    view.rerender(<OverlaySuspensionContext.Provider value={false}>{content}</OverlaySuspensionContext.Provider>);
    expect(screen.queryByRole(role)).toBeNull();
});
