import {loadSoilMaterials,cloneSoilMaterials} from './soil-materials.js';
import {SOIL_PRESET} from './soil-config.js';
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/three-0.185.1/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from '/vendor/three-0.185.1/examples/jsm/environments/RoomEnvironment.js';
import { MODEL_ASSETS, METER_ASSETS, TERRAIN_LAYERS, sceneSpec } from './model-spec.js';
import { tunePipeMaterial, tuneSoilMaterial, applyConcreteUV } from './model-appearance.js';
import { createTerrainGeometry, CAVITY_TINT } from './terrain-geometry.js';
import { assembleTremieGeometry } from './pipe-assembly.js';
import { collectFramePoints, centerCameraHorizontally } from './scene-framing.js';
import { fmt } from '../workbench/format.js';
import { projectedBounds, annotationFitScale, externalLabels } from './scene-labels.js';
import { sceneGeometryKey, sceneViewKey } from './scene-update.js';
import { concreteTopDepth, displayedSetting, tuneConcreteMaterial, updateConcreteRegions } from './concrete-state.js';
import { concreteCutawayProfile } from './concrete-geometry.js';
import { createReferenceSurface, updateReferenceSurface } from './concrete-surfaces.js';
import { createSceneInteraction } from './scene-interaction.js';
import { createSceneFloor } from './scene-floor.js';
import { bindSurfaceVisibility } from './surface-visibility.js';
import { createScenePulse } from './scene-pulse.js';
import { bindViewModeToggle } from './view-mode-toggle.js';
import { createLatestQueue, yieldToBrowser } from '../ui/scheduling.js';
import { displayPixelRatio, watchDisplayDensity } from '../ui/display-density.js';

                                                                                  
                                                                                
let assetsPromise;
function loadAssets() {
  return assetsPromise ||= Promise.all([Promise.all(Object.entries({ ...MODEL_ASSETS, ...METER_ASSETS }).map(async ([key, url]) => {
    let gltf;
    try { gltf = await new GLTFLoader().loadAsync(url); }
    catch (cause) { throw Object.assign(new Error(`Model asset failed: ${key}`, {cause}), {code:'MODEL_ASSET', asset:key}); }
    if (key in METER_ASSETS) return [key, gltf.scene];
    const parts = [];
    gltf.scene.traverse(node => {
      if (node.isMesh) parts.push({ geometry: node.geometry.clone().rotateX(Math.PI), material: node.material });
    });
    if (!parts.length) throw new Error(`Empty GLB: ${key}`);
    return [key, parts];
  })).then(Object.fromEntries),loadSoilMaterials()]).then(([models,soils])=>({...models,...soils})).catch(error => { assetsPromise = null; throw error; });
}

export async function createScene(host, cancelled) {
                                                                             
  const assets=await loadAssets();
  await yieldToBrowser();
  if (cancelled()) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (cause) { throw Object.assign(new Error('WebGL renderer initialization failed', {cause}), {code:'MODEL_WEBGL'}); }
  renderer.setPixelRatio(displayPixelRatio(host, 4_000_000));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
                                                                          
                                                                            
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.prepend(renderer.domElement);
  const labels = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  labels.classList.add('scene-labels'); labels.setAttribute('aria-hidden', 'true'); host.append(labels);
  const modelLegend=host.closest('.geometry-panel,.model-panel')?.querySelector('.geometry-legend,.model-footer');
  if(modelLegend && !modelLegend.querySelector('.concrete-legend')) {
    modelLegend.querySelector('.setting-line')?.remove();
    const legend=document.createElement('span');legend.className='concrete-legend';
    legend.innerHTML='<span class="concrete-fresh">未初凝</span><span class="concrete-set">已初凝／初凝估计</span><span class="concrete-unknown">初凝待判</span>';
    modelLegend.insertBefore(legend,modelLegend.querySelector('small') || null);
  }
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 500);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .55;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xcce9ff, 0x63727b, .65));
  const key = new THREE.DirectionalLight(0xfff3dc, 1.8); key.position.set(-8, 15, 20); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(2048,2048);
  key.shadow.bias = -.0001; key.shadow.normalBias = .015;
  scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xc4e5ff, .65); fill.position.set(12, -2, 10); scene.add(fill);
  let content = new THREE.Group(); scene.add(content);
  let owned = [], framePoints = [], spec, metrics, setting, mode, signature, builtGeometry, frame, concreteRegions, theorySurface, actualSurface, disposed = false, building = false, deferred = null, latestInput = null;
  let floor;
  const modeButton=document.createElement('button');modeButton.type='button';modeButton.className='scene-reset scene-view-mode';host.append(modeButton);
  const modeToggle=bindViewModeToggle(modeButton,nextMode=>{
    if (!latestInput || disposed) return;
    api.update(latestInput.slot,latestInput.metrics,latestInput.setting,nextMode);
    host.dispatchEvent(new CustomEvent('modelmodechange',{bubbles:true,detail:{mode:nextMode}}));
  });
  const resetButton=document.createElement('button');resetButton.type='button';resetButton.className='scene-reset';resetButton.setAttribute('aria-label','复位');resetButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M19.5 11a7.5 7.5 0 1 0-1.8 5.9"/></svg>';resetButton.title='复位视角';resetButton.hidden=true;host.append(resetButton);
  renderer.domElement.setAttribute('aria-label','三维视角：左键旋转，中键平移，滚轮缩放，方向键旋转，0 键或双击复位');
  renderer.domElement.title='左键旋转 · 按住中键平移 · 滚轮缩放 · 双击复位';
  const surfaceButton=document.createElement('button');surfaceButton.type='button';surfaceButton.className='scene-reset scene-surfaces';host.append(surfaceButton);
  const surfaceVisibility=bindSurfaceVisibility(surfaceButton,schedule);
  const interaction=createSceneInteraction(renderer.domElement,resetButton,schedule);
  const pulse=createScenePulse(host,{
    enabled:()=>!disposed&&!building&&!!floor&&mode==='solid'&&host.clientWidth>0,
    draw:time=>{floor.material.uniforms.time.value=time;floor.material.uniforms.pulseEnabled.value=1;renderer.render(scene,camera);host.dataset.pulseFrames=String(Number(host.dataset.pulseFrames||0)+1);host.dataset.pulseActive='true';},
    clear:()=>{host.dataset.pulseActive='false';if(floor){floor.material.uniforms.pulseEnabled.value=0;if(!disposed&&!building&&host.clientWidth)renderer.render(scene,camera);}}
  });
  const clear = () => { content.clear(); owned.forEach(value => value.dispose()); owned = []; concreteRegions = null; theorySurface=null;actualSurface=null;floor=null; };

  function surfaceMaterials(source, layerId, own) {
    const faces = {};
    source.traverse(node => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        faces[material.name.includes('_top_') ? 'top' : 'side'] = material;
      }
    });
    return ['top','side'].map(face => {
      const material = own(faces[face].clone());
      if (layerId) { tuneSoilMaterial(material, layerId); material.vertexColors = true; }
      for (const key of ['map','roughnessMap','metalnessMap']) if (material[key]) {
                                                                                
        if (material[key].wrapS !== THREE.RepeatWrapping || material[key].wrapT !== THREE.RepeatWrapping) {
          material[key].wrapS = material[key].wrapT = THREE.RepeatWrapping;
          material[key].needsUpdate = true;
        }
      }
      return material;
    });
  }

  async function rebuild(s, metrics, current) {
                                                                              
                                                                                
    const content = new THREE.Group(), owned = [];
    const own = value => { owned.push(value); return value; };
    let concreteRegions = null, complete = false;
    try {
    let sliceStarted = performance.now();
    const checkpoint = async () => {
      if (performance.now() - sliceStarted > 8) { await yieldToBrowser(); sliceStarted = performance.now(); }
      return current();
    };
    const slot = s.slot;
    let layerBottom = -s.height;
    const totalWeight = TERRAIN_LAYERS.reduce((sum, layer) => sum + layer.weight, 0);
    for (const layer of TERRAIN_LAYERS) {
      if (!await checkpoint()) return false;
      const layerHeight = s.height * layer.weight / totalWeight;
      const soil = new THREE.Mesh(own(createTerrainGeometry(s,layerHeight,layer)),cloneSoilMaterials(assets[layer.id],own));
      soil.position.y = layerBottom + layerHeight;
      soil.castShadow = true; soil.receiveShadow = true;
      content.add(soil);
      layerBottom += layerHeight;
    }

    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (const pipe of s.pipes) {
      if (!await checkpoint()) return false;
      if (!pipe.instances) continue;
                                                                              
                                                                             
      const count = pipe.instances;
      for (const part of assets[pipe.kind]) {
        if (!await checkpoint()) return false;
        const material = own(tunePipeMaterial(part.material.clone(), pipe.kind));
        material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), pipe.length * s.ratio)];
        material.clipShadows = true;
        if(pipe.kind === 'tremie') {
          const geometry=own(assembleTremieGeometry(part.geometry,pipe));
          const mesh=new THREE.Mesh(geometry,material); mesh.castShadow=true; mesh.receiveShadow=true;
          content.add(mesh);
          continue;
        }
        const mesh = new THREE.InstancedMesh(part.geometry, material, count);
        mesh.castShadow=true; mesh.receiveShadow=true;
        material.clipShadows=true;
        for (let i = 0; i < count; i++) {
          position.set(pipe.x, -i * pipe.unit.pitch * pipe.axialScale, pipe.zCenter);
          scale.set(pipe.radialScale, pipe.axialScale, pipe.radialScale);
          mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        content.add(mesh);
                                                                                  
        own(mesh);
      }
    }

    if (!await checkpoint()) return false;
    const concreteDepth = concreteTopDepth(slot, metrics);
    if (Number.isFinite(concreteDepth)) {
      const depth = concreteDepth;
      const h = (slot.depth - depth) * s.ratio;
      if (h > 0) {
        const shape = new THREE.Shape(concreteCutawayProfile(slot).map(([x,z])=>new THREE.Vector2(x,z)));
        const geometry = own(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 }));
        geometry.rotateX(Math.PI / 2);
        applyConcreteUV(geometry);
                                                                               
                                                                                   
        const wetPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
        const dryPlane = new THREE.Plane(new THREE.Vector3(0,-1,0),0);
        const concreteRegion = (wet, plane) => {
          const materials = surfaceMaterials(assets.C01, null, own).map(material => {
            tuneConcreteMaterial(material,wet);
            material.clippingPlanes=[plane];material.clipShadows=true;
            return material;
          });
          const mesh=new THREE.Mesh(geometry,materials);
          mesh.castShadow=true;mesh.receiveShadow=true;mesh.position.y=-depth*s.ratio;
          content.add(mesh);
          return mesh;
        };
        concreteRegions={wet:concreteRegion(true,wetPlane),dry:concreteRegion(false,dryPlane),wetPlane,dryPlane};
      }
    }
    const theorySurface=createReferenceSurface(s,'theory',own),actualSurface=createReferenceSurface(s,'actual',own);
    content.add(theorySurface,actualSurface);
    const framePoints = collectFramePoints(content);
                                                               
    const floor=createSceneFloor(s,own);content.add(floor);
    complete = true;
    return {content, owned, concreteRegions, theorySurface, actualSurface, framePoints, floor};
    } finally {
      if (!complete) { content.clear(); owned.forEach(value => value.dispose()); }
    }
  }

  function commitGeometry(draft, s) {
    scene.remove(content); clear();
    ({content, owned, concreteRegions, theorySurface, actualSurface, framePoints, floor} = draft);
    scene.add(content);
    const shadowSpan = Math.max(s.height,s.soilWidth,s.slot.thickness+3)+4;
    key.target.position.set(s.centerX,-s.height/2,0);
    key.position.copy(key.target.position).addScaledVector(new THREE.Vector3(-8,15,20).normalize(),shadowSpan*2);
    Object.assign(key.shadow.camera,{left:-shadowSpan/2,right:shadowSpan/2,top:shadowSpan/2,bottom:-shadowSpan/2,near:.1,far:shadowSpan*4});
    key.shadow.camera.updateProjectionMatrix();
    host.dataset.floorGrid='1m-radial-blue';
    host.dataset.pipeCount = String(s.pipes.filter(p => p.instances).length);
    host.dataset.compression = String(1 / s.ratio);
    host.dataset.assets = 'joint.glb tremie.glb C01.glb '+SOIL_PRESET.name+' soil1 soil2 soil3 soil4 soil5';
    host.dataset.soilMaterial=SOIL_PRESET.id+'-opaque';
    host.dataset.soilWidth = String(s.soilWidth);
    host.dataset.soilStructure = 'front-open-trench';
    host.dataset.soilFront = 'joint-centreline';
    host.dataset.cavityTint = CAVITY_TINT;
    host.dataset.soilLabels='hidden';
    host.dataset.concreteMaterial = 'C01';
    host.dataset.concreteCutaway = 'rear-half';
    host.dataset.tremieShading = 'assembled-radial-normals';
  }

  const project = (x, y, z = 0) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return [(p.x + 1) * host.clientWidth / 2, (1 - p.y) * host.clientHeight / 2];
  };
  const screenBounds = () => projectedBounds(framePoints.map(p => project(p.x, p.y, p.z)));
  function overlay(bounds) {
    const s = spec, slot = s.slot, w = host.clientWidth, h = host.clientHeight;
    labels.setAttribute('viewBox', `0 0 ${w} ${h}`);
    labels.innerHTML = externalLabels(s, project, bounds);
  }
  function render() {
    frame = null;
    if (disposed || building || deferred || host.dataset.updating==='true' || !spec || !host.clientWidth || !host.clientHeight) return;
    const aspect = host.clientWidth / host.clientHeight;
    let width = spec.viewWidth, height = spec.viewHeight;
    if (aspect > width / height) width = height * aspect; else height = width / aspect;
    if (mode === 'solid') { width *= 1.14; height *= 1.14; }
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2;
    const center = new THREE.Vector3(spec.centerX, spec.centerY, -spec.slot.thickness / 4);
    const distance = Math.max(width, height, spec.slot.thickness, 15) * 3;
    camera.near = Math.max(.01, distance / 10000); camera.far = distance * 5;
    interaction.setEnabled(mode==='solid');
    const {yaw,pitch,zoom}=interaction.view;
    camera.zoom=1;
    const direction = mode === 'solid' ? new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)) : new THREE.Vector3(0, 0, 1);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    centerCameraHorizontally(camera, center, framePoints);
    let bounds = screenBounds();
    const fit = annotationFitScale(bounds, host.clientWidth, host.clientHeight, spec.slot.depth);
    if (fit > 1) {
      camera.left *= fit; camera.right *= fit; camera.top *= fit; camera.bottom *= fit;
      camera.updateProjectionMatrix();
      bounds = screenBounds();
    }
    camera.zoom=mode==='solid'?zoom:1;camera.updateProjectionMatrix();
    if(mode==='solid')host.dataset.panBounds=JSON.stringify(interaction.setPanBounds(screenBounds(),host.clientWidth,host.clientHeight));
    const {panX,panY}=interaction.view;
    if(mode==='solid') {
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
      camera.position.addScaledVector(right,-panX*(camera.right-camera.left)/camera.zoom);
      camera.position.addScaledVector(up,panY*(camera.top-camera.bottom)/camera.zoom);
      camera.updateMatrixWorld();
    }
    if(floor)floor.visible=mode==='solid';
    bounds=screenBounds();
    host.dataset.cameraOrbit=JSON.stringify([yaw,pitch,camera.zoom]);
    host.dataset.cameraPan=JSON.stringify(mode==='solid'?[panX,panY]:[0,0]);
    if (bounds) for (const edge of ['left', 'right', 'top', 'bottom']) host.dataset[`frame${edge[0].toUpperCase()}${edge.slice(1)}`] = String(bounds[edge]);
    host.dataset.labelPlacement = 'outside';
    const concrete = updateConcreteRegions(concreteRegions, spec, metrics, setting);
    updateReferenceSurface(theorySurface,spec.slot,metrics?.theoreticalDepth,spec.ratio);
    updateReferenceSurface(actualSurface,spec.slot,metrics?.actualDepth,spec.ratio);
    if(!surfaceVisibility.visible){theorySurface.visible=false;actualSurface.visible=false;}
    host.dataset.referenceSurfaces=surfaceVisibility.visible?'shown':'hidden';
    host.dataset.theorySurface='soil-wide-blue-rectangle';host.dataset.actualSurface='soil-wide-green-rectangle';
    host.dataset.concreteTop=String(concreteTopDepth(spec.slot, metrics) ?? '');
    host.dataset.pipeDepths=JSON.stringify(Object.fromEntries(spec.pipes.map(pipe=>[pipe.id,pipe.depth])));
    host.dataset.pendingPipeDepths=JSON.stringify(spec.pipes.filter(pipe=>pipe.depthPending).map(pipe=>pipe.id));
    host.dataset.pipeDisplayLengths=JSON.stringify(Object.fromEntries(spec.pipes.map(pipe=>[pipe.id,pipe.length])));
    host.dataset.concretePhase = concrete.phase;
    host.dataset.settingDepth = concrete.boundary === null ? '' : String(concrete.boundary);
    const legend=host.closest('.geometry-panel,.model-panel')?.querySelector('.concrete-legend');
    if(legend) { legend.dataset.phase=concrete.phase; legend.title=concrete.phase==='unknown'?'初凝状态待判，模型暂保留原材质':'深灰为未初凝区，浅灰为建档已初凝区或按规则估计区；不代表现场强度试验'; }
    const ratio = displayPixelRatio(host, 4_000_000);
    if (Math.abs(renderer.getPixelRatio() - ratio) > .01) renderer.setPixelRatio(ratio);
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== host.clientWidth || size.y !== host.clientHeight) renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.needsUpdate=true;
    renderer.render(scene, camera); overlay(bounds);pulse.refresh();
    host.dataset.status = 'ready'; host.dataset.mode = mode;
    host.dataset.detailStage='complete';
    if(!host.dataset.firstFrameMs)host.dataset.firstFrameMs=(performance.now()-Number(host.dataset.loadStarted||0)).toFixed(1);
    if(!host.dataset.completeFrameMs)host.dataset.completeFrameMs=host.dataset.firstFrameMs;
    host.setAttribute('aria-label', `${spec.slot.code} 号槽三维模型，${mode === 'solid' ? '立体' : '正视'}视角，土体前缘退至接头管中心线，后侧厚度不变。混凝土仅展示后半厚度，管道前半侧露出。${spec.pipes.some(pipe=>pipe.depthPending)?'待初始化接头管按未起拔状态示意，实际深度待设备确认。':''}${concrete.phase==='unknown'?'初凝状态待判，保留原材质。':'深灰为未初凝混凝土，浅灰为建档已初凝区或按规则估计区。'}横向真实比例，纵向压缩 ${fmt(1 / spec.ratio, 1)} 倍。管节细节仅为示意，不表示实际节数。五层土体采用${SOIL_PRESET.name}，保留原有层厚比例，仅为示意。`);
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(render); }
  const queue = createLatestQueue(async (next, current) => {
    if (!host.clientWidth || !host.clientHeight) { deferred = next; return; }
    deferred = null;
    const key = sceneGeometryKey(next.slot, next.metrics);
    const changed = builtGeometry !== key;
    const nextSpec = sceneSpec(next.slot, next.metrics);
    if (changed) {
      building = true;
      try {
        await yieldToBrowser();
        if (!current()) return;
        const start = performance.now();
        const draft = await rebuild(nextSpec, next.metrics, current);
        if (!draft) return;
        if (!current()) { draft.content.clear(); draft.owned.forEach(value => value.dispose()); return; }
        commitGeometry(draft, nextSpec);
        builtGeometry = key;
        host.dataset.buildCount = String(Number(host.dataset.buildCount || 0) + 1);
        host.dataset.lastBuildMs = (performance.now() - start).toFixed(1);
      } finally { building = false; }
    }
    if (current()) {
      spec = nextSpec; metrics = next.metrics; setting = displayedSetting(metrics,next.setting); mode = next.mode;
      modeToggle.set(mode);
      signature = sceneViewKey(next.slot, metrics, setting, mode);
      delete host.dataset.updateError;
      schedule();
    }
  }, {
    delay: 90,
    onBusy: busy => { host.dataset.updating = String(busy); host.setAttribute('aria-busy', String(busy)); },
    onError: error => {
      host.dataset.status = builtGeometry ? 'ready' : 'error'; signature = null;
      host.dataset.updateError = 'true';
      host.querySelector('.scene-message').textContent = builtGeometry
        ? '模型更新失败，保留上次画面；请刷新重试。'
        : '模型更新失败，数据未受影响；请重试切换视角。';
      console.warn('Model update failed:', error);
    }
  });
  const observer = new ResizeObserver(() => {
    if (deferred && host.clientWidth && host.clientHeight) { const next = deferred; deferred = null; queue.enqueue(next); }
    else schedule();
  }); observer.observe(host);
  const unwatchDensity = watchDisplayDensity(schedule);
  const api = {
    update(slot, nextMetrics, nextSetting, nextMode) {
      if (disposed) return;
      deferred = null;
      latestInput = { slot, metrics: nextMetrics, setting: nextSetting };
      modeToggle.set(nextMode);
      const nextSignature = sceneViewKey(slot, nextMetrics, nextSetting, nextMode);
      if (nextSignature === signature && host.dataset.updating !== 'true') { if (host.dataset.status !== 'ready') schedule(); return; }
      if (!builtGeometry) host.dataset.status='loading';
      queue.enqueue({ slot, metrics: nextMetrics, setting: nextSetting, mode: nextMode });
    },
    dispose() {
      if (disposed) return;
      disposed = true; unwatchDensity();pulse.dispose();queue.dispose(); observer.disconnect(); cancelAnimationFrame(frame);
      interaction.dispose();resetButton.remove();modeToggle.dispose();modeButton.remove();surfaceVisibility.dispose();surfaceButton.remove();clear(); key.shadow.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove(); labels.remove();
      window.removeEventListener('pagehide', api.dispose);
    }
  };
  window.addEventListener('pagehide', api.dispose);
  return api;
}
