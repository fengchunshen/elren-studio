import React from 'react';
import { render,fireEvent } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { ConnectionLayer } from '@/components/editor/connection-layer';
const nodes=[{id:'a',type:'text-node',x:0,y:0,width:300,height:200},{id:'b',type:'gen-image',x:600,y:0,width:300,height:200}];
const connections=[{id:'edge',from:'a',to:'b'}];
const props={connections,nodesMap:new Map(nodes.map(n=>[n.id,n])),connectionsByNode:{to:new Map()},visibleNodes:nodes,mousePos:{x:0,y:0},getApiConfigByKey:()=>null,onDisconnectConnection:vi.fn()};
it('retains the SVG elements across parent updates and moves endpoints without remounting',()=>{
 const {container,rerender}=render(<ConnectionLayer {...props}/>);
 const svg=container.querySelector('svg'),edge=container.querySelector('[data-connection-id="edge"]'),path=edge.querySelector('path');
 const before=path.getAttribute('d');
 rerender(<ConnectionLayer {...props} mousePos={{x:10,y:10}}/>);
 expect(container.querySelector('svg')).toBe(svg);
 expect(container.querySelector('[data-connection-id="edge"]')).toBe(edge);
 const moved={...nodes[1],x:700};
 rerender(<ConnectionLayer {...props} nodesMap={new Map([['a',nodes[0]],['b',moved]])}/>);
 expect(container.querySelector('[data-connection-id="edge"]')).toBe(edge);
 expect(path.getAttribute('d')).not.toBe(before);
});
it('disconnects once on click and leaves hover visibility to CSS',()=>{
 const onDisconnectConnection=vi.fn();const {container}=render(<ConnectionLayer {...props} onDisconnectConnection={onDisconnectConnection}/>);
 const control=container.querySelector('.connection-delete');
 expect(control.style.opacity).toBe('');
 fireEvent.mouseDown(control);expect(onDisconnectConnection).not.toHaveBeenCalled();
 fireEvent.click(control.querySelector('circle'));expect(onDisconnectConnection).toHaveBeenCalledTimes(1);
 expect(onDisconnectConnection).toHaveBeenCalledWith('edge');
});
