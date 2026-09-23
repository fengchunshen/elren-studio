import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { EditorDialog } from './editor-dialog';

export function ThreeStudio({ node, source, onSave, onCapture, onClose }) {
    const [value, setValue] = useState(node.settings?.studio || { objects: source ? [{ id: 'source-model', kind: 'glb', url: source, position: [0, 0, 0], scale: 1 }] : [], background: '#161618', intensity: 2, focalLength: 35 });
    const [selected, setSelected] = useState(null), [error, setError] = useState(''), [ready, setReady] = useState(false);
    const [container, setContainer] = useState(null);
    const host = useRef(null), runtime = useRef(null), upload = useRef(null);
    const mount = useCallback(element => { host.current = element; setContainer(element); }, []);
    const dispose = root => root.traverse(item => { item.geometry?.dispose(); const materials = Array.isArray(item.material) ? item.material : [item.material]; materials.filter(Boolean).forEach(material => { Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); }); material.dispose(); }); });
    useEffect(() => {
        if (!container) return;
        let frame, observer, renderer, controls;
        try {
            const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
            renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
            host.current.appendChild(renderer.domElement);
            camera.position.fromArray(value.camera || [5, 3, 6]);
            controls = new OrbitControls(camera, renderer.domElement); controls.target.fromArray(value.target || [0, 0.5, 0]);
            controls.enableDamping = true;
            const group = new THREE.Group(); scene.add(group);
            const ambient = new THREE.HemisphereLight(0xffffff, 0x555566, 2); scene.add(ambient);
            const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 6, 4); scene.add(light);
            scene.add(new THREE.GridHelper(30, 30, 0x555555, 0x292929));
            const resize = () => { if (!host.current) return; renderer.setSize(host.current.clientWidth, host.current.clientHeight, false); camera.aspect = host.current.clientWidth / Math.max(1, host.current.clientHeight); camera.updateProjectionMatrix(); };
            observer = new ResizeObserver(resize); observer.observe(host.current); resize();
            runtime.current = { scene, camera, renderer, controls, group, light };
            const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }; animate(); setReady(true);
        } catch (error) { console.error('3D 视图初始化失败', error); setError('3D 视图初始化失败，请重新打开片场。'); }
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); if (runtime.current) dispose(runtime.current.scene); renderer?.dispose(); renderer?.domElement.remove(); runtime.current = null; };
    }, [container]);
    useEffect(() => {
        const state = runtime.current; if (!state) return;
        let canceled = false;
        const { scene, camera, group, light } = state;
        scene.background = new THREE.Color(value.background); light.intensity = Number(value.intensity); camera.setFocalLength(Number(value.focalLength) || 35);
        [...group.children].forEach(object => { dispose(object); group.remove(object); });
        const add = (object, spec) => { if (canceled) { dispose(object); return; } object.position.fromArray(spec.position || [0, 0.5, 0]); object.rotation.y = THREE.MathUtils.degToRad(spec.rotation || 0); object.scale.setScalar(spec.scale || 1); group.add(object); };
        value.objects.forEach(spec => {
            if (spec.kind === 'glb') {
                const manager = new THREE.LoadingManager(); manager.setURLModifier(url => { if (!/^(data:|blob:)/.test(url)) throw new Error('请使用内嵌素材的 GLB 文件'); return url; });
                fetch(spec.url).then(response => response.arrayBuffer()).then(buffer => new GLTFLoader(manager).parse(buffer, '', result => add(result.scene, spec), () => !canceled && setError('3D 资产加载失败，请使用自包含的 GLB 文件。'))).catch(() => !canceled && setError('3D 文件读取失败'));
            } else {
                const geometry = spec.kind === 'sphere' ? new THREE.SphereGeometry(0.5, 32, 16) : spec.kind === 'character' ? new THREE.CapsuleGeometry(0.25, 0.8, 8, 16) : new THREE.BoxGeometry(1, 1, 1);
                add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: spec.color || '#c4b5fd', roughness: 0.65 })), spec);
            }
        });
        return () => { canceled = true; };
    }, [value, ready]);
    const snapshot = () => ({ ...value, camera: runtime.current?.camera.position.toArray() || value.camera, target: runtime.current?.controls.target.toArray() || value.target });
    const addObject = kind => { const item = { id: crypto.randomUUID(), kind, position: [value.objects.length * 1.5, kind === 'character' ? 0.9 : 0.5, 0], scale: 1 }; setValue(previous => ({ ...previous, objects: [...previous.objects, item] })); setSelected(item.id); };
    const item = value.objects.find(item => item.id === selected);
    const patch = change => setValue(previous => ({ ...previous, objects: previous.objects.map(object => object.id === selected ? { ...object, ...change } : object) }));
    return <EditorDialog isOpen title="3D 片场" onClose={() => { onSave(snapshot()); onClose(); }} className="w-[1200px] max-w-[96vw]" bodyClassName="p-4">
        <div className="mb-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => addObject('box')}>立方体</Button><Button variant="outline" onClick={() => addObject('sphere')}>球体</Button><Button variant="outline" onClick={() => addObject('character')}>角色站位</Button><Button variant="outline" onClick={() => upload.current?.click()}>导入 GLB</Button>
            <Input ref={upload} className="hidden" type="file" accept=".glb" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 50 * 1024 * 1024) { setError('GLB 文件不能超过 50 MB'); return; } const reader = new FileReader(); reader.onload = () => { const object = { id: crypto.randomUUID(), kind: 'glb', name: file.name, url: reader.result, position: [0, 0, 0], scale: 1 }; setValue(previous => ({ ...previous, objects: [...previous.objects, object] })); setSelected(object.id); }; reader.readAsDataURL(file); event.target.value = ''; }} />
            <div className="ml-auto flex items-center gap-2"><Label>焦距</Label><NativeSelect aria-label="相机焦距" value={value.focalLength} onChange={event => setValue({ ...value, focalLength: Number(event.target.value) })}>{[16, 24, 35, 50, 85, 135].map(n => <option key={n} value={n}>{n} mm</option>)}</NativeSelect><Input type="color" aria-label="片场背景" className="w-12 p-1" value={value.background} onChange={event => setValue({ ...value, background: event.target.value })} /></div>
        </div>
        <div className="flex gap-3"><div ref={mount} tabIndex={0} aria-label="3D 场景" className="h-[min(60vh,600px)] min-w-0 flex-1 overflow-hidden rounded-xl" onKeyDown={event => { const state = runtime.current; if (!state || !['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) return; event.preventDefault(); event.stopPropagation(); const delta = new THREE.Vector3(event.key === 'a' ? -0.2 : event.key === 'd' ? 0.2 : 0, 0, event.key === 'w' ? -0.2 : event.key === 's' ? 0.2 : 0); state.camera.position.add(delta); state.controls.target.add(delta); }} />
            <aside className="w-44 space-y-3 overflow-y-auto">{value.objects.map(object => <Button key={object.id} variant={selected === object.id ? 'secondary' : 'ghost'} className="w-full justify-start truncate" onClick={() => setSelected(object.id)}>{object.name || ({ box: '立方体', sphere: '球体', character: '角色站位' })[object.kind]}</Button>)}
                {item && <>{['X', 'Y', 'Z'].map((label, index) => <Label key={label} className="block text-xs">{label}<Input aria-label={`对象 ${label}`} type="number" step={0.1} value={item.position[index]} onChange={event => patch({ position: item.position.map((value, i) => i === index ? Number(event.target.value) : value) })} /></Label>)}<Label className="block text-xs">旋转<Input aria-label="对象旋转" type="number" value={item.rotation || 0} onChange={event => patch({ rotation: Number(event.target.value) })} /></Label><Label className="block text-xs">缩放<Input aria-label="对象缩放" type="number" min={0.01} step={0.1} value={item.scale} onChange={event => patch({ scale: Math.max(0.01, Number(event.target.value)) })} /></Label><Button variant="ghost" size="sm" onClick={() => setValue({ ...value, objects: value.objects.filter(object => object.id !== selected) })}>移除对象</Button></>}
            </aside></div>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-3 flex items-center justify-between"><p className="text-xs text-muted-foreground">拖动环视，滚轮调整距离；聚焦片场后可用 WASD 移动。</p><div className="flex gap-2"><Button variant="outline" onClick={() => { onSave(snapshot()); onClose(); }}>保存片场</Button><Button disabled={!ready} onClick={() => { const { renderer, camera, scene } = runtime.current, width = host.current.clientWidth, height = host.current.clientHeight; renderer.setPixelRatio(1); renderer.setSize(1280, 720, false); camera.aspect = 16 / 9; camera.updateProjectionMatrix(); renderer.render(scene, camera); const url = renderer.domElement.toDataURL('image/png'); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); onSave(snapshot()); onCapture(url); }}>拍摄到画布</Button></div></div>
    </EditorDialog>;
}
