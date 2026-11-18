import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildCity,CITY,riverZ} from './city-world.js?v=city-style-v3';
import {makeFlight,stepFlight} from './city-physics.js?v=city-v1';
import {animateCity} from './city-activity.js?v=city-style-v3';
import {makePatrol,stepPatrol,PATROL_ALERT_HOLD} from './city-patrol.js';
import {bridgeLift,STREETS} from './city-layout.js?v=city-style-v3';
import {buildOperations} from './city-operations.js?v=city-response-v19';
import {startDispatch,stepDispatch,SCENARIOS} from './city-dispatch.js?v=city-style-v3';
import {makeCargoMission,stepCargoMission,CARGO_START,CARGO_END,CARGO_CRUISE_HEIGHT} from './city-cargo.js?v=city-response-v16';
import {buildCargoAircraft} from './city-cargo-model.js?v=city-response-v18';
import {buildAtmosphere} from './city-atmosphere.js?v=city-style-v3';

const $=id=>document.getElementById(id),stage=$('city-stage');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys=new Set(),touchKeys=new Set(),keyPulses=new Map(),clock=new T.Clock();
const state={ready:false,error:null,view:'overview',autoOrbit:false,showTitles:true,daylight:'中午',warningCount:0,environmentPaused:reducedMotion,flight:makeFlight(CITY.start),autoFollow:true,patrol:null,scenario:null,cargo:null};
let scene,camera,renderer,city,activity,operations,atmosphere,aircraft,cargoAircraft,rotors=[],elapsed=0,simTime=0,lastHUD=0,noticeUntil=0,warningUntil=0,lighting={};
let orbit={theta:0,phi:.57,radius:760},followOrbit={theta:.65,phi:.75,radius:24};
let priorPatrolCamera=null,priorScenarioCamera=null,priorCargoCamera=null,priorCargoFlight=null,scanVisuals=null,feedCaptureAt=0;
const currentTarget=new T.Vector3(0,0,0),targetCamera=new T.Vector3(),smoothTarget=new T.Vector3();
const up=new T.Vector3(0,1,0),q=new T.Quaternion(),bodyRotation=new T.Euler(),markerPos=new T.Vector3();
let pointer=null,lastPointer={x:0,y:0};

function notice(text){$('flight-notice').textContent=text;$('flight-notice').hidden=false;noticeUntil=elapsed+2;}
function setDaylight(index){
  const presets=[
    {name:'早晨',sky:0xe8f4fc,skyTop:'#6cb6e0',skyMiddle:'#b7ddf3',hemi:0xc5dcf0,ground:0xa1b5c8,sun:0xffd19b,sunPower:2.55,fill:0x83beeb,fillPower:.68,position:[-320,115,165],exposure:1.06},
    {name:'中午',sky:0x74c2e7,skyHorizon:'#f4fbff',fog:0xdaf1fb,skyTop:'#078fd0',skyMiddle:'#4bbde9',hemi:0xc7e7ff,ground:0x9baebe,sun:0xfffaf0,sunPower:3.6,fill:0xaddfff,fillPower:.45,position:[-230,350,170],exposure:1.06},
    {name:'傍晚',sky:0xe8ecfb,skyTop:'#547db7',skyMiddle:'#b6cdeb',hemi:0xa5c1dc,ground:0x8296b1,sun:0xffa969,sunPower:2.25,fill:0x87a9e7,fillPower:.72,position:[210,95,-190],exposure:.98}
  ];
  const p=presets[Math.max(0,Math.min(2,Number(index)||0))];state.daylight=p.name;
  $('daylight-label').textContent=p.name;$('daylight-slider').value=String(presets.indexOf(p));
  if(!scene)return;
  const sky=lighting.skyCanvas,ctx=sky.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,sky.height);
  const horizon=p.skyHorizon??`#${p.sky.toString(16).padStart(6,'0')}`;
  gradient.addColorStop(0,p.skyTop);gradient.addColorStop(.14,p.skyMiddle);gradient.addColorStop(.4,horizon);
  gradient.addColorStop(1,horizon);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,sky.width,sky.height);lighting.skyTexture.needsUpdate=true;
  scene.background=lighting.skyTexture;scene.fog.color.setHex(p.fog??p.sky);
  lighting.hemi.color.setHex(p.hemi);lighting.hemi.groundColor.setHex(p.ground);
  lighting.sun.color.setHex(p.sun);lighting.sun.intensity=p.sunPower;lighting.sun.position.set(...p.position);
  lighting.fill.color.setHex(p.fill);lighting.fill.intensity=p.fillPower;renderer.toneMappingExposure=p.exposure;
}
function playThreeAlarmTones(){
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    const context=new Audio();Promise.resolve(context.resume()).catch(()=>{});
    const start=context.currentTime+.025;
    for(let i=0;i<3;i++){
      const oscillator=context.createOscillator(),gain=context.createGain(),at=start+i*.38;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(720,at);oscillator.frequency.linearRampToValueAtTime(1040,at+.19);
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.065,at+.035);gain.gain.exponentialRampToValueAtTime(.0001,at+.25);
      oscillator.connect(gain).connect(context.destination);oscillator.start(at);oscillator.stop(at+.26);
    }
    setTimeout(()=>context.close().catch(()=>{}),1800);
  }catch(error){console.warn('Alarm sound unavailable',error);}
}
function showWarning(title,subtitle){
  $('warning-title').textContent=title;$('warning-subtitle').textContent=subtitle;
  $('warning-overlay').hidden=false;warningUntil=elapsed+2.7;state.warningCount++;playThreeAlarmTones();
}
function toggleUtility(panel,button){
  const show=$(panel).hidden;
  for(const [otherPanel,otherButton] of [['flight-controls','flight-controls-toggle'],['city-map-panel','city-map-toggle']]){
    const visible=show&&otherPanel===panel;$(otherPanel).hidden=!visible;$(otherButton).setAttribute('aria-expanded',String(visible));
  }
}
function setAutoOrbit(on){state.autoOrbit=on;$('auto-orbit').setAttribute('aria-pressed',String(on));$('auto-orbit').textContent=on?'暂停环绕':'自动环绕';}
function setView(view){state.view=view;$('view-overview').setAttribute('aria-pressed',String(view==='overview'));$('view-follow').setAttribute('aria-pressed',String(view==='follow'));if(view==='follow')setAutoOrbit(false);}
function clearInputs(){keys.clear();touchKeys.clear();keyPulses.clear();document.querySelectorAll('[data-flight-key]').forEach(b=>b.classList.remove('pressed'));}
function hideScanVisuals(){if(scanVisuals){scanVisuals.beam.visible=false;scanVisuals.ground.visible=false;scanVisuals.red.visible=false;scanVisuals.redLight.intensity=0;}}
function endPatrol(message){
  if(!state.patrol?.active)return;
  state.patrol.active=false;state.patrol=null;state.flight.velocity={x:0,y:0,z:0};
  if(priorPatrolCamera){followOrbit={...priorPatrolCamera};priorPatrolCamera=null;}
  $('start-patrol').textContent='一键巡检';$('start-patrol').setAttribute('aria-pressed','false');
  $('patrol-readout').hidden=true;$('patrol-readout').classList.remove('is-alert');$('patrol-alert').hidden=true;
  hideScanVisuals();
  if(message)notice(message);
}
function setScenarioSelection(id){document.querySelectorAll('[data-scenario]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scenario===id)));}
function endCargo(message){
  if(!state.cargo)return;
  state.cargo=null;cargoAircraft.group.visible=false;cargoAircraft.routeLine.visible=false;cargoAircraft.pads.forEach(p=>p.visible=false);
  aircraft.visible=true;if(priorCargoFlight){state.flight=priorCargoFlight;priorCargoFlight=null;}
  if(priorCargoCamera){followOrbit={...priorCargoCamera};priorCargoCamera=null;}
  $('flight-app').classList.remove('is-cargo');$('mission-panel').hidden=true;$('cargo-detail').hidden=true;
  setScenarioSelection(null);
  $('drone-marker').querySelector('span').textContent='空域先锋 01';
  if(message)notice(message);
}
function endScenario(message){
  if(state.cargo){endCargo(message);return;}
  if(!state.scenario)return;
  state.scenario=null;hideScanVisuals();operations?.clear();document.body.classList.remove('is-scenario');$('flight-app').classList.remove('is-scenario','is-inspecting','is-detected');
  setScenarioSelection(null);
  $('mission-panel').hidden=true;$('mission-feed').hidden=true;$('mission-voice').hidden=true;$('command-alert').hidden=true;$('warning-overlay').hidden=true;$('mission-photo').removeAttribute('src');
  if(priorScenarioCamera){followOrbit={...priorScenarioCamera};priorScenarioCamera=null;}
  try{speechSynthesis.cancel();}catch{}
  if(message)notice(message);
}
function speakTrafficWarning(){
  const phrase='无人机已现场取证，请立即离开。';
  $('mission-voice').textContent=`模拟喊话 ×2：${phrase} ${phrase}`;$('mission-voice').hidden=false;
  try{if('speechSynthesis' in window){speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(`${phrase} ${phrase}`);voice.lang='zh-CN';voice.rate=.86;voice.volume=.8;speechSynthesis.speak(voice);}}catch{}
}
function startScenario(id){
  if(!state.ready){notice('场景仍在载入，请稍候');return;}
  endPatrol();endScenario();clearInputs();
  state.scenario=startDispatch(id);operations.select(id);state.autoFollow=false;
  state.flight.position={...state.scenario.position};state.flight.velocity={x:0,y:0,z:0};state.flight.blocked=false;
  aircraft.position.set(state.scenario.position.x,state.scenario.position.y,state.scenario.position.z);
  priorScenarioCamera={...followOrbit};followOrbit.radius=42;followOrbit.phi=.72;setView('follow');setAutoOrbit(false);
  const {scenario,dock}=state.scenario;
  $('mission-origin-label').textContent='响应机库';$('mission-target-label').textContent='事件坐标';$('cargo-detail').hidden=true;
  $('mission-title').textContent=scenario.name;$('mission-tag').textContent='常态巡检';
  $('mission-phase').textContent=`${dock.name}缓慢开舱 · 准备巡查`;
  $('mission-dock').textContent=`${dock.name}（最近）`;
  $('mission-route').textContent=`约 ${Math.round(state.scenario.distanceMeters)} m / ${state.scenario.travelSeconds.toFixed(1)} 秒`;
  $('mission-coordinates').textContent=`X ${Math.round(scenario.target.x)} · Z ${Math.round(scenario.target.z)}`;
  $('mission-progress-bar').style.width='8%';$('mission-time').textContent='00:00';
  $('mission-message').textContent=scenario.result;
  $('mission-panel').hidden=false;$('mission-feed').hidden=true;$('mission-voice').hidden=true;$('command-alert').hidden=true;
  $('flight-app').classList.add('is-scenario','is-inspecting');$('flight-app').classList.remove('is-detected');setScenarioSelection(id);
  $('warning-overlay').hidden=true;warningUntil=0;
  notice(`${scenario.name}开始 · ${dock.name}正在开舱`);
}
function startCargo(){
  if(!state.ready){notice('运载场景仍在载入，请稍候');return;}
  endPatrol();endScenario();clearInputs();
  priorCargoFlight={position:{...state.flight.position},velocity:{...state.flight.velocity},distance:state.flight.distance,blocked:false};
  state.cargo=makeCargoMission();state.autoFollow=false;
  state.flight.position={...state.cargo.position};state.flight.velocity={x:0,y:0,z:0};state.flight.blocked=false;
  aircraft.visible=false;cargoAircraft.group.visible=true;cargoAircraft.routeLine.visible=true;cargoAircraft.pads.forEach(p=>p.visible=true);
  cargoAircraft.group.position.set(CARGO_START.x,CARGO_START.y,CARGO_START.z);
  cargoAircraft.group.rotation.y=Math.atan2(CARGO_END.x-CARGO_START.x,CARGO_END.z-CARGO_START.z);
  priorCargoCamera={...followOrbit};followOrbit.theta=-.65;followOrbit.radius=48;followOrbit.phi=.58;setView('follow');setAutoOrbit(false);
  $('mission-origin-label').textContent='出发地点';$('mission-target-label').textContent='目的地';
  $('mission-title').textContent='运载场景';$('mission-tag').textContent='物流运载';
  $('mission-phase').textContent='医院物资装载完成 · 垂直起飞';
  $('mission-dock').textContent='城市医院屋顶';
  $('mission-route').textContent=`约 ${Math.round(state.cargo.distanceMeters)} m / ${Math.round(state.cargo.totalSeconds)} 秒`;
  $('mission-coordinates').textContent='城市商场屋顶';
  $('mission-progress-bar').style.width='3%';$('mission-time').textContent='00:00';
  $('mission-feed').hidden=true;$('mission-voice').hidden=true;$('command-alert').hidden=true;
  $('cargo-detail').hidden=false;$('cargo-detail').textContent=`目标巡航高度 ${CARGO_CRUISE_HEIGHT} m · 货箱已固定`;
  $('mission-panel').hidden=false;$('flight-app').classList.add('is-cargo');setScenarioSelection('cargo');
  $('drone-marker').querySelector('span').textContent='空域先锋 · 运载 01';
  notice('医院 → 商场 · 四旋翼运载任务已起飞');
}
function startPatrol(){
  if(!state.ready){notice('场景仍在载入，请稍候');return;}
  if(state.patrol?.active){endPatrol('巡检已结束，可手动飞行');return;}
  endScenario();
  clearInputs();state.patrol=makePatrol(state.flight.position);state.autoFollow=false;
  priorPatrolCamera={...followOrbit};followOrbit.radius=52;followOrbit.phi=.85;
  setView('follow');$('start-patrol').textContent='结束巡检';$('start-patrol').setAttribute('aria-pressed','true');
  $('patrol-readout').hidden=false;$('patrol-phase').textContent='自动巡检 · 沿路飞行';$('patrol-timer').textContent='00:00';
  $('patrol-alert').hidden=true;notice('自动巡检已开始，沿公路飞行');
}
function reset(){endPatrol();endScenario();clearInputs();state.flight=makeFlight(CITY.start);if(aircraft){aircraft.position.set(CITY.start.x,CITY.start.y,CITY.start.z);aircraft.rotation.set(0,0,0);}notice('已回到广场上空');}
function fail(error){console.error(error);state.error=error.message;state.ready=false;$('city-loading').hidden=true;$('city-error').hidden=false;$('flight-status').textContent='场景未就绪';}
function startControls(){
  const handled=['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'];
  addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey||!$('help-panel').hidden)return;
    if(handled.includes(e.code)){e.preventDefault();if(state.patrol?.active)endPatrol('已切换手动飞行');if(state.scenario||state.cargo)endScenario('已切换手动飞行');setAutoOrbit(false);keys.add(e.code);keyPulses.set(e.code,elapsed+.09);document.querySelector(`[data-flight-key="${e.code}"]`)?.classList.add('pressed');}
    if(e.code==='KeyR'&&!e.repeat){e.preventDefault();reset();}
  });
  addEventListener('keyup',e=>{keys.delete(e.code);document.querySelector(`[data-flight-key="${e.code}"]`)?.classList.remove('pressed');});
  addEventListener('blur',clearInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInputs();});
  for(const b of document.querySelectorAll('[data-flight-key]')){
    const release=()=>{touchKeys.delete(b.dataset.flightKey);b.classList.remove('pressed');};
    b.addEventListener('pointerdown',e=>{e.preventDefault();if(state.patrol?.active)endPatrol('已切换手动飞行');if(state.scenario||state.cargo)endScenario('已切换手动飞行');touchKeys.add(b.dataset.flightKey);keyPulses.set(b.dataset.flightKey,elapsed+.09);b.classList.add('pressed');b.setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,release);
  }
  $('view-overview').onclick=()=>{endPatrol();endScenario();state.autoFollow=false;setView('overview');};$('view-follow').onclick=()=>{endPatrol();endScenario();state.autoFollow=false;setView('follow');};
  $('start-patrol').onclick=startPatrol;
  $('flight-controls-toggle').onclick=()=>toggleUtility('flight-controls','flight-controls-toggle');
  $('city-map-toggle').onclick=()=>toggleUtility('city-map-panel','city-map-toggle');
  $('daylight-slider').addEventListener('input',e=>setDaylight(e.target.value));
  for(const option of document.querySelectorAll('[data-scenario]'))option.onclick=()=>option.dataset.scenario==='cargo'?startCargo():startScenario(option.dataset.scenario);
  $('end-scenario').onclick=()=>endScenario('场景演示已结束');$('command-alert-close').onclick=()=>{$('command-alert').hidden=true;};
  setAutoOrbit(state.autoOrbit);$('auto-orbit').onclick=()=>{endPatrol();endScenario();setView('overview');state.autoFollow=true;setAutoOrbit(!state.autoOrbit);};
  $('reset-flight').onclick=reset;
  $('pause-city').setAttribute('aria-pressed',String(state.environmentPaused));$('pause-city').textContent=state.environmentPaused?'继续环境':'暂停环境';
  $('pause-city').onclick=()=>{state.environmentPaused=!state.environmentPaused;$('pause-city').setAttribute('aria-pressed',String(state.environmentPaused));$('pause-city').textContent=state.environmentPaused?'继续环境':'暂停环境';};
  $('scene-labels-toggle').onclick=()=>{state.showTitles=!state.showTitles;const button=$('scene-labels-toggle');button.setAttribute('aria-pressed',String(state.showTitles));button.setAttribute('aria-label',state.showTitles?'场景标题已显示，点击隐藏':'场景标题已隐藏，点击显示');button.title=state.showTitles?'隐藏场景标题':'显示场景标题';};
  const help=show=>{$('help-panel').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));clearInputs();if(show){endPatrol();endScenario();$('help-close').focus();}else $('help-toggle').focus();};
  $('help-toggle').onclick=()=>help($('help-panel').hidden);$('help-close').onclick=()=>help(false);addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('help-panel').hidden)help(false);});
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('flight-app').requestFullscreen)await $('flight-app').requestFullscreen();else notice('此浏览器不支持全屏，页面已铺满可用区域');}catch{notice('未能进入全屏，仍可在当前窗口飞行');}};
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏 ↙':'全屏 ↗';});
  $('city-retry').onclick=()=>location.reload();
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','智慧城市三维飞行场景。WASD 平移，空格上升，Shift 下降。拖拽视角，滚轮缩放。');
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;setAutoOrbit(false);pointer=e.pointerId;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(pointer);canvas.classList.add('dragging');canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const o=state.view==='overview'?orbit:followOrbit;o.theta-=(e.clientX-lastPointer.x)*.005;o.phi=T.MathUtils.clamp(o.phi+(e.clientY-lastPointer.y)*.004,.16,1.34);lastPointer={x:e.clientX,y:e.clientY};});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{pointer=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('wheel',e=>{e.preventDefault();setAutoOrbit(false);const o=state.view==='overview'?orbit:followOrbit;const lo=state.view==='overview'?180:8,hi=state.view==='overview'?1500:85;o.radius=T.MathUtils.clamp(o.radius*Math.exp(T.MathUtils.clamp(e.deltaY,-200,200)*.0014),lo,hi);},{passive:false});
}
function init(){
  scene=new T.Scene();scene.background=new T.Color(0xeaf3fa);scene.fog=new T.Fog(0xeaf3fa,440,920);
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
  camera=new T.PerspectiveCamera(43,innerWidth/innerHeight,.2,6500);
  const hemi=new T.HemisphereLight(0xc7e7ff,0x9baebe,1.15);scene.add(hemi);
  const sun=new T.DirectionalLight(0xfffaf0,3.6);sun.position.set(-230,350,170);sun.castShadow=true;const shadowSize=innerWidth<700?2048:4096;sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sun.shadow.camera,{left:-610,right:610,top:500,bottom:-500,near:1,far:1050});sun.shadow.normalBias=.18;sun.shadow.bias=-.00009;scene.add(sun);
  const fill=new T.DirectionalLight(0xaddfff,.45);fill.position.set(120,70,-140);scene.add(fill);
  const skyCanvas=document.createElement('canvas');skyCanvas.width=8;skyCanvas.height=512;
  const skyTexture=new T.CanvasTexture(skyCanvas);skyTexture.colorSpace=T.SRGBColorSpace;
  lighting={hemi,sun,fill,skyCanvas,skyTexture};setDaylight(1);
  city=buildCity(scene);activity=animateCity(scene,city);operations=buildOperations(scene);atmosphere=buildAtmosphere(scene);cargoAircraft=buildCargoAircraft(scene);
  const floor=new T.Mesh(new T.PlaneGeometry(6500,6500),new T.MeshStandardMaterial({color:0xe7f0f7,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.5;floor.receiveShadow=true;scene.add(floor);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();clearInputs();fail(new Error('WebGL context lost'));});
  startControls();updateCamera(1,true);renderer.setAnimationLoop(tick);
}
async function loadAircraft(){
  const gltf=await new GLTFLoader().loadAsync('./assets/drone-flight.glb?v=city-v1',e=>{if(e.total){$('city-progress').style.width=`${Math.round(e.loaded/e.total*90+5)}%`;$('city-load-label').textContent=`正在载入无人机 ${Math.round(e.loaded/e.total*100)}%`;}});
  aircraft=gltf.scene;aircraft.name='Controlled aircraft';scene.add(aircraft);
  aircraft.position.set(CITY.start.x,CITY.start.y,CITY.start.z);
  aircraft.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(/^ROTOR[ _](LF|LR|RF|RR)/.test(o.name))rotors.push({node:o,rest:o.quaternion.clone(),direction:o.userData.Rotation_direction?.startsWith('CCW')?-1:1});});
  if(rotors.length!==4)throw new Error('Missing four propeller pivots');
  const bounds=new T.Box3().setFromObject(aircraft);state.aircraftDimensions=bounds.getSize(new T.Vector3()).toArray();
  buildScanVisuals(bounds);
  state.ready=true;$('city-loading').hidden=true;$('flight-status').textContent='悬停待命';
}
function buildScanVisuals(bounds){
  const ground=new T.Mesh(new T.CircleGeometry(1,64),new T.ShaderMaterial({
    uniforms:{uTime:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;uniform float uTime;void main(){vec2 p=vUv*2.0-1.0;float r=length(p);float a=atan(p.y,p.x);float sweep=pow(max(0.0,cos(a-uTime*0.48)),11.0);float edge=1.0-smoothstep(0.65,1.0,r);float waves=0.82+0.18*sin(r*25.0-uTime*1.4);vec3 blue=vec3(0.06,0.42,1.0);vec3 violet=vec3(0.45,0.12,1.0);vec3 c=mix(blue,violet,0.5+0.5*sin(uTime*0.35+a));gl_FragColor=vec4(c,edge*waves*(0.15+0.55*sweep));}'
  }));ground.name='Patrol ground scan';ground.rotation.x=-Math.PI/2;ground.renderOrder=8;ground.visible=false;scene.add(ground);
  const beam=new T.Mesh(new T.CylinderGeometry(.008,1,1,40,1,true),new T.ShaderMaterial({
    uniforms:{uTime:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;uniform float uTime;void main(){float a=vUv.x*6.283185;float sweep=pow(max(0.0,cos(a-uTime*0.48)),8.0);vec3 c=mix(vec3(0.18,0.38,0.95),vec3(0.43,0.20,0.92),0.5+0.5*sin(a*2.0+uTime*0.31));gl_FragColor=vec4(c,(0.065+0.19*sweep)*(0.65+0.35*vUv.y));}'
  }));
  beam.name='Blue violet radial camera scan';beam.visible=false;beam.renderOrder=7;scene.add(beam);
  const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()).sub(aircraft.position);
  const red=new T.Group();red.position.set(center.x,center.y+size.y*.16,center.z);aircraft.add(red);red.visible=false;
  const core=new T.Mesh(new T.SphereGeometry(.105,12,8),new T.MeshBasicMaterial({color:0xff163f}));red.add(core);
  const halo=new T.Mesh(new T.SphereGeometry(.29,12,8),new T.MeshBasicMaterial({color:0xff1937,transparent:true,opacity:.22,depthWrite:false,blending:T.AdditiveBlending}));red.add(halo);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(64,64,3,64,64,64);gradient.addColorStop(0,'rgba(255,38,54,0.95)');gradient.addColorStop(.25,'rgba(255,28,56,0.7)');gradient.addColorStop(1,'rgba(255,24,50,0)');glowContext.fillStyle=gradient;glowContext.fillRect(0,0,128,128);
  const glow=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.scale.set(2.2,2.2,1);red.add(glow);
  const redLight=new T.PointLight(0xff1434,0,10,1.7);red.add(redLight);
  scanVisuals={ground,beam,red,redLight};
}
function updateScanVisuals(){
  if(!scanVisuals)return;
  const inspection=state.scenario;
  const scanning=inspection&&(inspection.phase==='observing'||inspection.phase==='flying'&&inspection.phaseSeconds>inspection.travelSeconds*.24);
  if(!state.patrol?.active&&!scanning){hideScanVisuals();return;}
  const {ground,beam,red,redLight}=scanVisuals,p=state.flight.position;
  const yaw=aircraft.rotation.y,sweepTime=reducedMotion?0:elapsed,groundHeight=Math.abs(p.z-205)<11.5?18.72:STREETS.some(r=>r.axis==='z'&&Math.abs(p.x-r.at)<5.6)?.5+bridgeLift(p.x,p.z):.5;
  const approach=inspection?(inspection.phase==='observing'?1:T.MathUtils.clamp(inspection.phaseSeconds/inspection.travelSeconds,0,1)):0;
  const target=inspection?.scenario.target;
  const footprint=inspection?new T.Vector3(
    T.MathUtils.lerp(p.x,target.x,.28+.72*approach)+Math.sin(sweepTime*.43)*2.4,
    target.y+.17,
    T.MathUtils.lerp(p.z,target.z,.28+.72*approach)+Math.cos(sweepTime*.43)*2.4
  ):new T.Vector3(p.x+Math.sin(yaw)*2.5+Math.sin(sweepTime*.48)*1.2,groundHeight+.13,p.z+Math.cos(yaw)*2.5+Math.cos(sweepTime*.48)*1.2);
  const source=new T.Vector3(p.x+Math.sin(yaw)*.24,p.y-.16,p.z+Math.cos(yaw)*.24),axis=source.clone().sub(footprint),height=axis.length();
  ground.position.copy(footprint);ground.scale.setScalar((inspection?5.4:6.3)+Math.sin(sweepTime*.65)*.6);ground.material.uniforms.uTime.value=sweepTime;ground.visible=true;beam.material.uniforms.uTime.value=sweepTime;
  beam.position.copy(source).add(footprint).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(up,axis.normalize());beam.scale.set(inspection?5.2:6,height,inspection?5.2:6);beam.visible=true;
  const alarm=inspection?inspection.detected:state.patrol.phase==='alert';red.visible=alarm;redLight.intensity=alarm?18+(reducedMotion?0:4*Math.sin(elapsed*4)):0;
}
function updateCamera(dt,snap=false){
  const o=state.view==='overview'?orbit:followOrbit;
  // A kilometre-wide overview needs a less extreme depth range than close flight.
  // Keeping a larger near plane prevents coplanar-looking roads/water from flickering.
  const near=state.view==='overview'?5:.2;if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  if(state.view==='overview')currentTarget.set(0,7,0);else currentTarget.set(state.flight.position.x,state.flight.position.y-(state.cargo?3:state.patrol?.active||state.scenario?12:0),state.flight.position.z);
  const responsive=state.view==='overview'?Math.max(1,1.82/camera.aspect):1;
  const radius=o.radius*responsive;
  // Portrait overview pulls back farther; keep atmospheric haze beyond the city.
  scene.fog.near=Math.max(590,radius+230);scene.fog.far=scene.fog.near+850;
  targetCamera.set(Math.sin(o.theta)*Math.cos(o.phi)*radius,Math.sin(o.phi)*radius,Math.cos(o.theta)*Math.cos(o.phi)*radius).add(currentTarget);
  if(state.view==='follow'){
    // Keep the inspection camera above buildings along its sightline.
    for(let i=1;i<=8;i++){const p=currentTarget.clone().lerp(targetCamera,i/8);for(const b of city.colliders)if(Math.abs(p.x-b.x)<b.w/2+2&&Math.abs(p.z-b.z)<b.d/2+2&&p.y<b.height+4)targetCamera.y=Math.max(targetCamera.y,b.height+6);}
  }
  const k=snap?1:1-Math.exp(-dt*(state.cargo?12:3.5));camera.position.lerp(targetCamera,k);smoothTarget.lerp(currentTarget,k);camera.lookAt(smoothTarget);
}
function updateFlight(dt){
  const held=code=>keys.has(code)||touchKeys.has(code)||(keyPulses.get(code)||0)>elapsed;
  let f=Number(held('KeyW'))-Number(held('KeyS')),r=Number(held('KeyD'))-Number(held('KeyA')),y=Number(held('Space'))-Number(held('ShiftLeft')||held('ShiftRight'));
  if((f||r||y)&&state.patrol?.active)endPatrol('已切换手动飞行');
  if((f||r||y)&&(state.scenario||state.cargo))endScenario('已切换手动飞行');
  if((f||r||y)&&state.autoFollow){state.autoFollow=false;setView('follow');$('first-flight-hint').textContent='松开按键即可悬停';}
  const theta=(state.view==='overview'?orbit:followOrbit).theta;
  if(f||r||y)setAutoOrbit(false);
  if(state.cargo){
    if(dt<=0)return;
    const old={...state.flight.position},events=stepCargoMission(state.cargo,dt);
    state.flight.position={...state.cargo.position};state.flight.velocity={...state.cargo.velocity};state.flight.blocked=false;
    state.flight.distance+=Math.hypot(state.flight.position.x-old.x,state.flight.position.y-old.y,state.flight.position.z-old.z);
    cargoAircraft.group.position.set(state.cargo.position.x,state.cargo.position.y,state.cargo.position.z);
    for(const rotor of cargoAircraft.rotors)rotor.pivot.rotation.y+=dt*29*rotor.direction;
    if(events.atCruise){$('mission-phase').textContent='已爬升至 100 m · 向商场巡航';notice('到达 100 米巡航高度，正在前往商场');}
    if(events.atMall){$('mission-phase').textContent='抵达商场上空 · 开始下降';notice('已到达商场上空，准备降落');}
    if(events.delivered){$('mission-phase').textContent='商场屋顶已送达 · 货箱完好';$('mission-progress-bar').style.width='100%';notice('运载任务完成：物资已送达城市商场');}
    return;
  }
  if(state.scenario){
    const old={...state.flight.position},events=stepDispatch(state.scenario,dt);
    const scenario=state.scenario.scenario;
    state.flight.position={...state.scenario.position};state.flight.velocity={...state.scenario.velocity};state.flight.blocked=false;
    state.flight.distance+=Math.hypot(state.flight.position.x-old.x,state.flight.position.y-old.y,state.flight.position.z-old.z);
    if(events.lifted){$('mission-phase').textContent='舱门开启 · 无人机缓慢垂直升起';$('mission-progress-bar').style.width='20%';notice('无人机正在缓慢出舱');}
    if(events.departed){$('mission-phase').textContent='无人机已出舱 · 蓝紫扫光巡查中';$('mission-progress-bar').style.width='35%';notice(`空域先锋 01 正飞往${scenario.name}区域`);}
    if(events.arrived){$('mission-phase').textContent='镜头持续扫光 · 正在识别现场';$('mission-progress-bar').style.width='82%';}
    if(events.detected){$('flight-app').classList.add('is-detected');$('mission-tag').textContent='发现告警';$('mission-phase').textContent=`${scenario.brief} · 正在拍照定位`;showWarning(`发现告警 · ${scenario.name}`,`${scenario.brief} · 坐标已记录`);notice(`发现告警 · ${scenario.brief}`);}
    if(events.photoReady){
      $('mission-phase').textContent='影像与坐标已回传指挥中心';$('mission-progress-bar').style.width='100%';$('mission-feed').hidden=false;
      $('command-alert-text').textContent=state.scenario.scenario.result;$('command-alert').hidden=false;feedCaptureAt=0;
      if(state.scenario.scenario.id==='traffic')speakTrafficWarning();
    }
  }else if(state.patrol?.active){
    const old={...state.flight.position},events=stepPatrol(state.patrol,dt);
    state.flight.position={...state.patrol.position};state.flight.velocity={...state.patrol.velocity};state.flight.blocked=false;
    state.flight.distance+=Math.hypot(state.flight.position.x-old.x,state.flight.position.y-old.y,state.flight.position.z-old.z);
    if(events.startedAlert){$('patrol-alert').hidden=false;$('patrol-readout').classList.add('is-alert');$('patrol-phase').textContent='红色报警 · 悬停排查';$('flight-notice').hidden=true;showWarning('巡检异常预警','空域先锋 01 悬停排查 · 3 秒后继续飞行');}
    if(events.resumed){$('patrol-alert').hidden=true;$('patrol-readout').classList.remove('is-alert');$('patrol-phase').textContent='自动巡检 · 继续飞行';notice('报警处置完成，继续巡检');}
  }else stepFlight(state.flight,{x:-Math.sin(theta)*f+Math.cos(theta)*r,z:-Math.cos(theta)*f-Math.sin(theta)*r,y},dt,city.colliders,{x:CITY.width/2-5,z:CITY.depth/2-5});
  const p=state.flight.position,v=state.flight.velocity;aircraft.position.set(p.x,p.y,p.z);
  const speed=Math.hypot(v.x,v.z);
  if(speed>.2){const heading=Math.atan2(v.x,v.z);const delta=Math.atan2(Math.sin(heading-aircraft.rotation.y),Math.cos(heading-aircraft.rotation.y));aircraft.rotation.y+=delta*(1-Math.exp(-dt*6));}
  aircraft.rotation.z=T.MathUtils.damp(aircraft.rotation.z,-r*.07,5,dt);aircraft.rotation.x=T.MathUtils.damp(aircraft.rotation.x,f*.055,5,dt);
  for(const rotor of rotors)rotor.node.quaternion.copy(rotor.rest).multiply(q.setFromAxisAngle(up,elapsed*33*rotor.direction));
  if(state.flight.blocked&&(f||r||y)&&elapsed>noticeUntil)notice(p.y<2.1?'已到最低安全高度':p.y>119.7?'已到最高飞行高度':'前方存在建筑或边界，已限制移动');
}
function updateMap(){
  const canvas=$('mini-map'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const px=x=>(x+CITY.width/2)/CITY.width*w,pz=z=>(z+CITY.depth/2)/CITY.depth*h;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#edf3f7';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c2d5d7';for(const [x,z,rx,rz] of city.mountains){ctx.beginPath();ctx.ellipse(px(x),pz(z),rx/CITY.width*w,rz/CITY.depth*h,0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#91d4e9';ctx.beginPath();ctx.ellipse(px(city.lake.x),pz(city.lake.z),city.lake.rx/CITY.width*w,city.lake.rz/CITY.depth*h,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#91d4e9';ctx.lineWidth=8;ctx.beginPath();for(let x=-CITY.width/2;x<=CITY.width/2;x+=6)ctx.lineTo(px(x),pz(riverZ(x)));ctx.stroke();
  for(const r of city.roads){ctx.strokeStyle=r.height?'#87a7bc':'#ccd9e2';ctx.lineWidth=r.height?3:2;ctx.beginPath();if(r.axis==='x'){ctx.moveTo(px(r.min),pz(r.at));ctx.lineTo(px(r.max),pz(r.at));}else{ctx.moveTo(px(r.at),pz(r.min));ctx.lineTo(px(r.at),pz(r.max));}ctx.stroke();}
  for(const b of city.mapBuildings){ctx.fillStyle=b.h>40?'#8babbf':'#bdcfdc';ctx.fillRect(px(b.x-b.w/2),pz(b.z-b.d/2),b.w/CITY.width*w,b.d/CITY.depth*h);}
  if(state.scenario){const {dock,scenario}=state.scenario;ctx.strokeStyle='#d94a5b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px(dock.x),pz(dock.z));ctx.lineTo(px(scenario.target.x),pz(scenario.target.z));ctx.stroke();for(const [x,z,color] of [[dock.x,dock.z,'#21ae8e'],[scenario.target.x,scenario.target.z,'#e44156']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(px(x),pz(z),4.7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.stroke();}}
  if(state.cargo){ctx.strokeStyle='#148fca';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(px(CARGO_START.x),pz(CARGO_START.z));ctx.lineTo(px(CARGO_END.x),pz(CARGO_END.z));ctx.stroke();ctx.setLineDash([]);for(const point of [CARGO_START,CARGO_END]){ctx.fillStyle=point===CARGO_START?'#25a4d7':'#42cabb';ctx.beginPath();ctx.arc(px(point.x),pz(point.z),4.7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.stroke();}}
  const p=state.flight.position;ctx.fillStyle='#187bd0';ctx.beginPath();ctx.arc(px(p.x),pz(p.z),4.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
}
function updateHUD(){
  const p=state.flight.position,v=state.flight.velocity,speed=Math.hypot(v.x,v.y,v.z);
  $('altitude').innerHTML=`${p.y.toFixed(1)}<small>m</small>`;$('speed').innerHTML=`${speed.toFixed(1)}<small>m/s</small>`;$('distance').innerHTML=`${Math.round(state.flight.distance)}<small>m</small>`;
  $('flight-status').textContent=state.cargo?({climb:'运载起飞中',cruise:'100 m 巡航中',descent:'商场降落中',delivered:'运载任务完成'}[state.cargo.phase]):state.scenario?state.scenario.detected?'发现告警 · 现场回传':({opening:'机库开舱中',launching:'无人机出舱中',flying:'蓝紫扫光巡检中',observing:'镜头识别现场中'}[state.scenario.phase]):state.patrol?.phase==='alert'?'报警悬停':state.patrol?.active?'自动巡检中':speed>.3?'自由飞行中':'悬停待命';$('coordinates').textContent=`X ${Math.round(p.x)} · Z ${Math.round(p.z)}`;
  if(state.patrol?.active){const s=Math.floor(state.patrol.seconds);$('patrol-timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(state.patrol.phase==='alert')$('alert-countdown').textContent=`${Math.ceil(PATROL_ALERT_HOLD-state.patrol.alertSeconds)}s`;}
  if(state.scenario){const s=Math.floor(state.scenario.seconds);$('mission-time').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(state.scenario.phase==='flying')$('mission-progress-bar').style.width=`${Math.round(35+45*Math.min(1,state.scenario.phaseSeconds/state.scenario.travelSeconds))}%`;}
  if(state.cargo){const s=Math.floor(state.cargo.seconds);$('mission-time').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;$('mission-progress-bar').style.width=`${Math.min(100,Math.max(3,Math.round(state.cargo.seconds/state.cargo.totalSeconds*100)))}%`;$('cargo-detail').textContent=`目标巡航高度 ${CARGO_CRUISE_HEIGHT} m · 当前 ${p.y.toFixed(1)} m · 货箱固定`;}
  $('district-name').textContent=p.z< -195?'北岭森林':p.z>195?'高架居住区':p.x>195&&p.z>0&&p.z<135?'镜湖公园':p.x< -190?(p.z>135?'电力园区':'公共服务区'):p.x>190&&p.z<0?'商业中心':p.z>95?(p.x< -45?'滨水港区':'清洁能源区'):p.z>55?'滨水长廊':p.x< -110?'产业园区':p.x< -42?'生活服务区':p.x<34?'城市中心':'创新街区';
  updateMap();
}
function tick(){
  const dt=Math.min(clock.getDelta(),.05);if(document.hidden)return;elapsed+=dt;
  if(state.view==='overview'&&state.autoOrbit&&pointer===null&&$('help-panel').hidden)orbit.theta+=dt*.026;
  if(!state.environmentPaused){simTime+=dt;city.update(dt);activity.tick(dt,simTime);}
  operations?.update(dt,elapsed,state.scenario);
  atmosphere?.update(dt,state.view==='overview',state.environmentPaused,reducedMotion,camera,state.showTitles);
  if(state.ready){updateFlight(dt);updateScanVisuals();}updateCamera(dt);
  if(state.ready&&elapsed-lastHUD>.1){lastHUD=elapsed;updateHUD();}
  if(elapsed>noticeUntil)$('flight-notice').hidden=true;
  if(elapsed>warningUntil)$('warning-overlay').hidden=true;
  if(aircraft){markerPos.copy(state.cargo?cargoAircraft.group.position:aircraft.position);markerPos.y+=state.cargo?3:1.2;markerPos.project(camera);const visible=!state.patrol?.active&&!state.scenario&&markerPos.z<1&&Math.abs(markerPos.x)<1&&Math.abs(markerPos.y)<1;$('drone-marker').style.display=visible?'block':'none';$('drone-marker').style.left=`${(markerPos.x*.5+.5)*stage.clientWidth}px`;$('drone-marker').style.top=`${(-markerPos.y*.5+.5)*stage.clientHeight}px`;}
  renderer.render(scene,camera);
  if(state.scenario?.photoSent&&elapsed-feedCaptureAt>1.1){feedCaptureAt=elapsed;try{const frame=renderer.domElement.toDataURL('image/jpeg',.62);if(frame.length>5000)$('mission-photo').src=frame;}catch(error){console.warn('Simulated live frame unavailable',error);}}
}
function getState(){return {ready:state.ready,error:state.error,view:state.view,auto_orbit:state.autoOrbit,daylight:state.daylight,warning_count:state.warningCount,warning_visible:!$('warning-overlay').hidden,flight_controls_visible:!$('flight-controls').hidden,city_map_visible:!$('city-map-panel').hidden,camera_orbit:{...orbit},position:{...state.flight.position},velocity:{...state.flight.velocity},distance:state.flight.distance,rotors:rotors.length,aircraft_dimensions_m:state.aircraftDimensions,environment_paused:state.environmentPaused,simulation_time:simTime,patrol:state.patrol?.active?{active:true,phase:state.patrol.phase,seconds:state.patrol.seconds,alert_seconds:state.patrol.alertSeconds,alert_triggered:state.patrol.alertTriggered,waypoint:state.patrol.targetIndex,scan_visible:scanVisuals?.ground.visible,red_light_visible:scanVisuals?.red.visible}:null,scenario:state.scenario?{id:state.scenario.scenario.id,phase:state.scenario.phase,dock:state.scenario.dock.id,seconds:state.scenario.seconds,travel_seconds:state.scenario.travelSeconds,distance_meters:state.scenario.distanceMeters,target:state.scenario.scenario.target,detected:state.scenario.detected,scan_visible:Boolean(scanVisuals?.beam.visible),photo_sent:state.scenario.photoSent}:null,cargo:state.cargo?{phase:state.cargo.phase,seconds:state.cargo.seconds,altitude_m:state.cargo.position.y,origin:'城市医院',destination:'城市商场',distance_meters:state.cargo.distanceMeters,cruise_height_m:CARGO_CRUISE_HEIGHT,delivered:state.cargo.delivered,rotors:cargoAircraft?.rotors.length,payload_visible:cargoAircraft?.group.visible}:null,command_network:operations?.getState(),city:{...city?.stats,...activity?.stats},traffic:activity?.getState(),renderer:renderer?.info.render,collision_blocked:state.flight.blocked};}
window.cityFlight=Object.freeze({getState});
function registerFlightTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});let running=false;
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(e=>console.warn('Flight tools unavailable',e));}catch(e){console.warn('Flight tools unavailable',e);}};
  register({name:'read_city_flight',description:'Read the current simulated aircraft state, city traffic, view and model scale.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>getState()});
  register({name:'set_city_view',description:'Switch the visible city camera to overview or aircraft follow.',inputSchema:{type:'object',properties:{view:{enum:['overview','follow']}},required:['view'],additionalProperties:false},execute:async input=>{if(!['overview','follow'].includes(input.view))throw Error('Invalid view');endPatrol();endScenario();state.autoFollow=false;setView(input.view);await new Promise(r=>setTimeout(r,900));return {view:state.view};}});
  register({name:'set_city_patrol',description:'Start or stop the simulated automatic city road inspection. The first alert occurs after ten seconds of patrol flight and pauses for three seconds.',inputSchema:{type:'object',properties:{action:{enum:['start','stop']}},required:['action'],additionalProperties:false},execute:input=>{if(!['start','stop'].includes(input.action))throw Error('Invalid patrol action');if(input.action==='start'){if(!state.patrol?.active)startPatrol();}else endPatrol();return {patrol:getState().patrol,view:state.view};}});
  register({name:'run_city_scenario',description:'Run or stop a simulated city task: fire, traffic, river debris, power equipment, or hospital-to-mall cargo transport.',inputSchema:{type:'object',properties:{action:{enum:['start','stop']},scenario:{enum:['fire','traffic','river','power','cargo']}},required:['action'],additionalProperties:false},execute:input=>{if(input.action==='start'){if(input.scenario==='cargo')startCargo();else if(SCENARIOS.some(s=>s.id===input.scenario))startScenario(input.scenario);else throw Error('Choose a valid scenario');}else if(input.action==='stop')endScenario();else throw Error('Invalid action');return {scenario:getState().scenario,cargo:getState().cargo,command_network:getState().command_network};}});
  register({name:'fly_city_aircraft',description:'Hold one flight control for a bounded duration in this simulated city, then release it. Does not control a real aircraft.',inputSchema:{type:'object',properties:{direction:{enum:['forward','backward','left','right','up','down']},seconds:{type:'number',minimum:.1,maximum:5}},required:['direction','seconds'],additionalProperties:false},execute:async input=>{
    const mapping={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',up:'Space',down:'ShiftLeft'};
    if(!Object.hasOwn(mapping,input.direction)||!Number.isFinite(input.seconds)||input.seconds<.1||input.seconds>5)throw Error('Invalid flight direction or duration');
    if(!state.ready||document.hidden||!$('help-panel').hidden||running)throw Error('Flight is unavailable or another command is running');
    running=true;const code=mapping[input.direction];if(state.patrol?.active)endPatrol('已切换手动飞行');if(state.scenario||state.cargo)endScenario('已切换手动飞行');try{touchKeys.add(code);await new Promise(r=>setTimeout(r,input.seconds*1000));}finally{touchKeys.delete(code);running=false;}
    await new Promise(r=>setTimeout(r,700));return {position:{...state.flight.position},distance:state.flight.distance,blocked:state.flight.blocked};
  }});
}
registerFlightTools();
try{init();loadAircraft().catch(fail);}catch(e){fail(e);}
