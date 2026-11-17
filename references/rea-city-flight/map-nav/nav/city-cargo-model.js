import * as T from 'three';
import {CARGO_START,CARGO_END,CARGO_CRUISE_HEIGHT} from './city-cargo.js';

const shell=new T.MeshStandardMaterial({color:0xeaf2f7,metalness:.16,roughness:.44});
const trim=new T.MeshStandardMaterial({color:0x226f9d,metalness:.28,roughness:.47});
const graphite=new T.MeshStandardMaterial({color:0x263b48,metalness:.24,roughness:.58});
const blade=new T.MeshStandardMaterial({color:0x35434c,metalness:.14,roughness:.52,side:T.DoubleSide});
const safety=new T.MeshStandardMaterial({color:0xf8a540,roughness:.46});
const cargoMat=new T.MeshStandardMaterial({color:0xd4e6f0,metalness:.08,roughness:.63});

function box(parent,material,w,h,d,x=0,y=0,z=0){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(parent,material,top,bottom,h,x=0,y=0,z=0){
  const mesh=new T.Mesh(new T.CylinderGeometry(top,bottom,h,16),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function rod(parent,a,b,r,material){
  const start=new T.Vector3(...a),end=new T.Vector3(...b);
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,start.distanceTo(end),8),material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());
  mesh.castShadow=true;parent.add(mesh);return mesh;
}

export function buildCargoAircraft(scene){
  const group=new T.Group();group.name='Medium four-rotor cargo aircraft with suspended parcel';group.visible=false;scene.add(group);
  box(group,graphite,4.55,.52,5.6,0,-.22,0);
  box(group,shell,4.8,1.18,5.8,0,.38,0);
  box(group,trim,4.95,.16,5.9,0,.8,0);
  box(group,shell,2.7,.42,3.5,0,1.01,-.2);
  box(group,graphite,1.85,.12,1.15,0,1.27,-1.15);
  for(const x of [-1.85,1.85]){
    box(group,trim,.14,.48,3.5,x,.16,0);
    box(group,graphite,.28,.34,.7,x,-.18,1.95);
  }
  const rotors=[];
  for(const [i,[sideX,sideZ]] of [[-1,-1],[-1,1],[1,-1],[1,1]].entries()){
    const x=sideX*5.15,z=sideZ*4.85;
    rod(group,[sideX*1.75,.51,sideZ*1.8],[x,.84,z],.23,shell);
    cylinder(group,graphite,.75,.82,.76,x,.99,z);
    cylinder(group,trim,.55,.59,.16,x,1.46,z);
    const pivot=new T.Group();pivot.position.set(x,1.61,z);group.add(pivot);
    box(pivot,blade,4.25,.065,.34);
    box(pivot,blade,.34,.065,4.25);
    for(const sx of [-1,1])box(pivot,safety,.35,.075,.37,sx*1.98,0,0);
    for(const sz of [-1,1])box(pivot,safety,.37,.075,.35,0,0,sz*1.98);
    cylinder(pivot,graphite,.23,.23,.12,0,.07,0);
    rotors.push({pivot,direction:i%2?-1:1});
  }
  // Four tension cables keep a genuinely separate transport box below the airframe.
  const payload=new T.Group();payload.name='Suspended cargo box';group.add(payload);
  for(const x of [-1.12,1.12])for(const z of [-1.08,1.08])rod(payload,[x,-.48,z],[x*1.06,-2.48,z*1.06],.035,graphite);
  box(payload,cargoMat,3.02,2.05,2.82,0,-3.42,0);
  box(payload,trim,3.12,.18,2.92,0,-2.38,0);
  box(payload,graphite,3.12,.18,2.92,0,-4.45,0);
  for(const x of [-1.48,1.48])for(const z of [-1.35,1.35])box(payload,trim,.15,2.1,.15,x,-3.42,z);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
  const context=canvas.getContext('2d');context.fillStyle='#1d6f9f';context.fillRect(0,0,512,160);
  context.fillStyle='#fff';context.textAlign='center';context.textBaseline='middle';context.font='700 76px "PingFang SC","Microsoft YaHei",sans-serif';context.fillText('运载物资',256,85,490);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  for(const side of [-1,1]){
    const label=new T.Mesh(new T.PlaneGeometry(2.6,.82),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
    label.position.set(0,-3.42,side*1.418);label.rotation.y=side<0?Math.PI:0;payload.add(label);
  }
  for(const p of [CARGO_START,CARGO_END]){
    const pad=new T.Group();pad.name=p===CARGO_START?'Hospital cargo launch pad':'Mall cargo landing pad';pad.position.set(p.x,p===CARGO_START?19.38:23.38,p.z);pad.visible=false;scene.add(pad);
    const mat=new T.MeshBasicMaterial({color:p===CARGO_START?0x32b6ed:0x50d8c5,transparent:true,opacity:.84,depthWrite:false});
    const ring=new T.Mesh(new T.TorusGeometry(5.5,.16,6,48),mat);ring.rotation.x=Math.PI/2;pad.add(ring);
    for(const angle of [0,Math.PI/2]){const line=box(pad,mat,5,.05,.14,0,.03,0);line.rotation.y=angle;}
    if(!group.userData.pads)group.userData.pads=[];group.userData.pads.push(pad);
  }
  const routePoints=[new T.Vector3(CARGO_START.x,CARGO_START.y,CARGO_START.z),new T.Vector3(CARGO_START.x,CARGO_CRUISE_HEIGHT,CARGO_START.z),new T.Vector3(CARGO_END.x,CARGO_CRUISE_HEIGHT,CARGO_END.z),new T.Vector3(CARGO_END.x,CARGO_END.y,CARGO_END.z)];
  const line=new T.Line(new T.BufferGeometry().setFromPoints(routePoints),new T.LineDashedMaterial({color:0x219ee1,dashSize:4,gapSize:3,transparent:true,opacity:.55,depthWrite:false}));line.computeLineDistances();line.visible=false;line.name='Hospital to mall cargo flight path';scene.add(line);
  return {group,rotors,pads:group.userData.pads,routeLine:line};
}
