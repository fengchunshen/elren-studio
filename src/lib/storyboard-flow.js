export function resolveStoryboardShot(shot, targetId, nodesMap, connections) {
    if (!shot.imageSource) return shot;
    const source=nodesMap.get(shot.imageSource.nodeId);
    const linked=connections.some(edge=>edge.from===source?.id&&edge.to===targetId);
    const upstream=source?.settings?.shots?.find(item=>item.id===shot.imageSource.shotId);
    const image=linked&&source?.settings?.mode==='image'&&upstream?.outputEnabled
        ? upstream.output_images?.[upstream.selectedImageIndex >= 0 ? upstream.selectedImageIndex : 0] || upstream.output_url || '' : '';
    const label=`分镜画面 · ${upstream?.title||shot.title||'当前镜头'}`;
    return {...shot,image_url:image,image_filename:label,image_urlSource:{nodeId:shot.imageSource.nodeId,name:label},
        frameBindingError:image?'':!linked?'请连接前一步的分镜画面':!upstream?'对应的画面镜头已不存在':'请先在分镜画面中生成并确认这一镜'};
}

export function resolveStoryboardNode(node,nodesMap,connections) {
    if(node.type!=='storyboard-node'||!node.settings?.shots?.some(shot=>shot.imageSource))return node;
    return {...node,settings:{...node.settings,shots:node.settings.shots.map(shot=>resolveStoryboardShot(shot,node.id,nodesMap,connections))}};
}
