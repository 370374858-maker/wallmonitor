import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createTerrainGeometry} from '../models/terrain-geometry.js';
import {createSceneFloor} from '../models/scene-floor.js';
import {createSceneInteraction} from '../models/scene-interaction.js';
import {applyConcreteUV} from '../models/model-appearance.js';
import {displayPixelRatio} from '../ui/display-density.js';

                                                                                
                                                                              
export function createMaterialViewer(host, resetButton, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-label', '材质三维预览：左键旋转，中键平移，滚轮缩放，双击复位');
  host.prepend(renderer.domElement);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose();
  let entries = [], version = 0, frame = null, autorotate = false, disposed = false;
  const interaction = createSceneInteraction(renderer.domElement, resetButton, schedule);
  interaction.setEnabled(true);
                                                                                   
                                                                        
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 500);

  const disposeEntry = entry => {
    entry.owned.forEach(value => value.dispose());
    entry.lights?.forEach(light => light.shadow?.dispose());
    entry.scene?.clear();
  };

  async function makeEntry(item, options) {
    const owned = [], own = value => {owned.push(value);return value;};
    const entry = {item, owned, scene:null, lights:[]};
    const maps = {};
    try {
      const roles = options.mode === 'source' ? ['albedo','normal','ao','roughness','metallic'] : ['albedo','normal','ao'];
      const loaded = await Promise.allSettled(roles.filter(role => item.maps[role]).map(async role => {
        const source = item.maps[role];
        const texture = own(await new THREE.TextureLoader().loadAsync(source.url));
        texture.colorSpace = role === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        texture.repeat.set(...(options.mode === 'source' ? source.repeat : [1,1])).multiplyScalar(options.repeat);
        if (options.mode === 'source') texture.offset.set(...source.offset);
        maps[role] = texture;
      }));
      const failed = loaded.find(result => result.status === 'rejected');
      if (failed) throw new Error('材质贴图读取失败：' + item.name, {cause:failed.reason});
      const material = own(new THREE.MeshStandardMaterial({
        name:item.id, map:maps.albedo||null, normalMap:maps.normal||null, aoMap:maps.ao||null,
        roughnessMap:maps.roughness||null, metalnessMap:maps.metallic||null,
        roughness:options.roughness,
        metalness:options.mode === 'platform' ? 0 : maps.metallic ? 1 : item.sourceSettings.metalness,
        normalScale:new THREE.Vector2(options.normal, options.normal),
        aoMapIntensity:options.mode === 'platform' ? .45 : item.sourceSettings.aoIntensity,
        color:new THREE.Color().setRGB(...item.sourceColor.slice(0,3),THREE.SRGBColorSpace),
        transparent:false, opacity:1, depthWrite:true,
        vertexColors:options.shape === 'trench'
      }));
      const scene = entry.scene = new THREE.Scene();
      scene.environment = environment.texture;
      scene.environmentIntensity = .55;
      scene.add(new THREE.HemisphereLight(0xcce9ff,0x63727b,.65));
      const key = new THREE.DirectionalLight(0xfff3dc,1.8);
      key.target.position.set(0,2.4,0);
      key.position.copy(key.target.position).addScaledVector(new THREE.Vector3(-8,15,20).normalize(),24);
      key.castShadow = true;key.shadow.mapSize.set(2048,2048);
      key.shadow.bias = -.0001;key.shadow.normalBias = .015;
      Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:48});
      key.shadow.camera.updateProjectionMatrix();
      const fill = new THREE.DirectionalLight(0xc4e5ff,.65);fill.position.set(12,-2,10);
      scene.add(key,key.target,fill);entry.lights.push(key);
      let geometry, y;
      if (options.shape === 'trench') {
        const spec = {slot:{width:4,thickness:1.8},soilLeft:-2,soilWidth:8,pipes:[]};
        geometry = own(createTerrainGeometry(spec,4.8,{tileMeters:3,offset:[0,0]}));
        geometry.translate(-2,4.8,1.955);y=0;
      } else if (options.shape === 'sphere') {
        geometry=own(new THREE.SphereGeometry(2.4,80,48));y=2.4;
      } else {
        geometry=own(applyConcreteUV(new THREE.BoxGeometry(7,.6,5),3));y=.3;
      }
      const mesh = new THREE.Mesh(geometry,material);mesh.position.y=y;
      mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
      const floor=createSceneFloor({soilWidth:8,centerX:0,height:0,slot:{thickness:1.8}},own);
      floor.position.z=0;scene.add(floor);
      return entry;
    } catch (error) { disposeEntry(entry);throw error; }
  }

  async function update(items, options) {
    const current = ++version;
    callbacks.loading?.(true);
    const results = await Promise.allSettled(items.map(item => makeEntry(item, options)));
    const next = results.filter(result=>result.status==='fulfilled').map(result=>result.value);
    const failure = results.find(result=>result.status==='rejected');
    if (disposed || current !== version || failure) {
      next.forEach(disposeEntry);
      if (current === version && !disposed) { callbacks.loading?.(false);callbacks.error?.(failure.reason); }
      return;
    }
    entries.forEach(disposeEntry);entries=next;
    host.dataset.materials=items.map(item=>item.id).join(',');
    host.dataset.shape=options.shape;host.dataset.mode=options.mode;
    host.dataset.status='ready';
    callbacks.ready?.(items);callbacks.loading?.(false);schedule();
  }

  function draw() {
    frame=null;
    if(disposed || !host.clientWidth || !host.clientHeight || !entries.length)return;
    if(autorotate) interaction.view.yaw+=.004;
    const width=host.clientWidth,height=host.clientHeight;
    const ratio=displayPixelRatio(host,4_000_000);
    if (renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    renderer.setSize(width,height,false);
    renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
    const cols=entries.length>1?2:1, rows=entries.length>2?2:1;
    for(let i=0;i<entries.length;i++) {
      const x=Math.floor(i%cols*width/cols), right=Math.floor((i%cols+1)*width/cols);
      const top=Math.floor(Math.floor(i/cols)*height/rows),bottom=Math.floor((Math.floor(i/cols)+1)*height/rows);
      const w=right-x,h=bottom-top;
      renderer.setViewport(x,height-bottom,w,h);renderer.setScissor(x,height-bottom,w,h);
      const {yaw,pitch,zoom,panX,panY}=interaction.view;
      let viewWidth=11.6,viewHeight=9.2;
      if(w/h>viewWidth/viewHeight)viewWidth=viewHeight*w/h;else viewHeight=viewWidth*h/w;
      Object.assign(camera,{left:-viewWidth/2,right:viewWidth/2,top:viewHeight/2,bottom:-viewHeight/2,zoom});
      const center=new THREE.Vector3(0,2.05,0);
      const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
      camera.position.copy(center).addScaledVector(direction,40);camera.lookAt(center);
      camera.updateProjectionMatrix();camera.updateMatrixWorld();
      const rightAxis=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),upAxis=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
      camera.position.addScaledVector(rightAxis,-panX*viewWidth/zoom).addScaledVector(upAxis,panY*viewHeight/zoom);
      camera.updateMatrixWorld();renderer.shadowMap.needsUpdate=true;
      renderer.render(entries[i].scene,camera);
    }
    renderer.setScissorTest(false);
    host.dataset.orbit=JSON.stringify([interaction.view.yaw,interaction.view.pitch,interaction.view.zoom]);
    if(autorotate)schedule();
  }
  function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
  const observer=new ResizeObserver(schedule);observer.observe(host);
  const api={update,setAutorotate(value){autorotate=value;schedule();},
    async snapshot(){draw();return new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));},
    dispose(){if(disposed)return;disposed=true;version++;cancelAnimationFrame(frame);observer.disconnect();interaction.dispose();entries.forEach(disposeEntry);environment.dispose();renderer.dispose();renderer.domElement.remove();window.removeEventListener('pagehide',api.dispose);}
  };
  window.addEventListener('pagehide',api.dispose);
  return api;
}
