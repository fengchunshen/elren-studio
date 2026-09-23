import {expect,it,vi} from 'vitest';
vi.mock('@/services/apiClient',()=>({api:vi.fn(async()=>({id:'job'}))}));
vi.mock('@/services/platformContext',()=>({getPlatformContext:()=>({project:{id:'project'}})}));
vi.mock('@/services/taskService',()=>({uploadAsset:vi.fn(async()=>({id:'uploaded'}))}));
import {renderTimeline} from '@/services/mediaJobs';
import {uploadAsset} from '@/services/taskService';
import {api} from '@/services/apiClient';
it('resolves imported media before upload while retaining stable saved clip URLs',async()=>{
 const clips=[{url:'local-img:imported',start:0,end:2},{url:'local-img:imported',start:2,end:5}];
 const resolve=vi.fn(async()=> 'data:video/mp4;base64,AA==');
 await renderTimeline(clips,'720x1280','concat',resolve);
 expect(resolve).toHaveBeenCalledTimes(1);
 expect(uploadAsset).toHaveBeenCalledWith('data:video/mp4;base64,AA==','clip.mp4');
 expect(clips[0].url).toBe('local-img:imported');
 expect(api.mock.calls[0][1].body).toMatchObject({width:720,height:1280,clips:[{asset_id:'uploaded',start:0,end:2},{asset_id:'uploaded',start:2,end:5}]});
});
