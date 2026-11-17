import * as T from 'three';
import {CITY,riverZ} from './city-layout.js?v=city-style-v3';
import {extendDistricts} from './city-districts.js?v=city-style-v3';
export {CITY,riverZ};
export function buildCity(scene){
  const colliders=[],mapBuildings=[],windRotors=[],intersections=[];
  const world=new T.Group();world.name='Original smart city';scene.add(world);
  const mats={white:new T.MeshStandardMaterial({color:0xf8fafb,roughness:.74}),ivory:new T.MeshStandardMaterial({color:0xe4edf2,roughness:.72}),glass:new T.MeshStandardMaterial({color:0xb7d8eb,metalness:.25,roughness:.3}),blue:new T.MeshStandardMaterial({color:0x2277b4,roughness:.46,metalness:.12}),navy:new T.MeshStandardMaterial({color:0x37647c,roughness:.65}),road:new T.MeshStandardMaterial({color:0xa6bac8,roughness:.94}),line:new T.MeshStandardMaterial({color:0xf8fcff,roughness:1}),tree:new T.MeshStandardMaterial({color:0x8ebebd,roughness:.95}),water:new T.MeshStandardMaterial({color:0x72cbe9,metalness:.12,roughness:.3}),ground:new T.MeshStandardMaterial({color:0xeaf1f5,roughness:.95})};
  const geo={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,20),cone:new T.ConeGeometry(1,1,10),sphere:new T.SphereGeometry(1,10,7),ring:new T.TorusGeometry(1,.055,6,48)};
  mats.road.color.setHex(0x8597a5);mats.water.color.setHex(0x28b9e2);mats.water.roughness=.58;mats.water.metalness=.08;mats.tree.color.setHex(0x60a58d);
  const batches=new Map(),dummy=new T.Object3D();
  function add(type,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const key=type+':'+mat;if(!batches.has(key))batches.set(key,[]);dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();batches.get(key).push(dummy.matrix.clone());}
  const box=(mat,x,y,z,w,h,d,ry=0)=>add('box',mat,x,y,z,w,h,d,0,ry);
  const cyl=(mat,x,y,z,r,h)=>add('cyl',mat,x,y,z,r,h,r);
  function rod(a,b,r,mat='white'){a=new T.Vector3(...a);b=new T.Vector3(...b);dummy.position.copy(a.clone().add(b).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());dummy.scale.set(r,a.distanceTo(b),r);dummy.updateMatrix();const key='cyl:'+mat;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(dummy.matrix.clone());}
  function outline(x,z,w,d,y,th=.3,mat='white'){box(mat,x,y,z-d/2,w,th,th);box(mat,x,y,z+d/2,w,th,th);box(mat,x-w/2,y,z,th,th,d);box(mat,x+w/2,y,z,th,th,d);}
  function tree(x,z,h=4){cyl('ivory',x,h*.35,z,.2,h*.7);add('cone','tree',x,h*.75,z,h*.30,h*.95,h*.30);}
  function building(x,z,w,d,h,type='office'){
    box('ivory',x,.35,z,w+2,.7,d+2);box('white',x,h/2+.7,z,w,h,d);
    colliders.push({x,z,w:w+1,d:d+1,height:h+.9});mapBuildings.push({x,z,w,d,h});
    outline(x,z,w-.7,d-.7,h+.9,.55);box('ivory',x,h+.82,z,w-1.6,.15,d-1.6);
    if(type==='tower'){
      for(let yy=3;yy<h;yy+=3.4){box('glass',x,yy,z-d/2-.035,w-.7,1.8,.09);box('glass',x+w/2+.035,yy,z,.09,1.8,d-.7);box('glass',x-w/2-.035,yy,z,.09,1.8,d-.7);box('glass',x,yy,z+d/2+.035,w-.7,1.8,.09);outline(x,z,w+.15,d+.15,yy+1.15,.16);}
      for(let xx=-w/2+1.3;xx<w/2;xx+=3.1){box('white',x+xx,h/2,z-d/2-.12,.2,h,.3);box('white',x+xx,h/2,z+d/2+.12,.2,h,.3);}
      box('blue',x,h+1.5,z,Math.min(w*.4,6),1.2,Math.min(d*.4,6));
    }else{
      for(let yy=3;yy<h-1;yy+=3.3){for(let xx=-w/2+1.8;xx<w/2-1;xx+=3){box('glass',x+xx,yy,z-d/2-.03,1.1,1.6,.09);box('glass',x+xx,yy,z+d/2+.03,1.1,1.6,.09);}for(let zz=-d/2+2;zz<d/2-1;zz+=3){box('glass',x+w/2+.04,yy,z+zz,.09,1.6,1.1);box('glass',x-w/2-.04,yy,z+zz,.09,1.6,1.1);}}
      box('ivory',x+w*.2,h+1.3,z-d*.1,w*.24,1,d*.22);
    }
    box('glass',x,1.9,z+d/2+.1,2.2,2.7,.2);
  }
  // White island plinth; the meandering canal divides urban and energy districts.
  box('white',0,-1.8,0,CITY.width,3.2,CITY.depth);box('ground',0,-.10,0,CITY.width-.7,.3,CITY.depth-.7);
  const waterV=[],waterI=[];for(let i=0;i<=160;i++){let x=-548+i*1096/160,z=riverZ(x);waterV.push(x,.14,z-13,x,.14,z+13);if(i<160)waterI.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
  const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(waterV,3));wg.setIndex(waterI);wg.computeVertexNormals();const water=new T.Mesh(wg,mats.water);water.name='Meandering canal';water.receiveShadow=true;world.add(water);
  function bank(offset){for(const [start,end] of [[-548,204],[301,548]]){let ps=[];for(let i=0;i<=100;i++){let x=start+i*(end-start)/100;ps.push(new T.Vector3(x,.3,riverZ(x)+offset));}const c=new T.CatmullRomCurve3(ps);const m=new T.Mesh(new T.TubeGeometry(c,180,.65,6,false),mats.white);m.receiveShadow=true;world.add(m);}}
  bank(-13.5);bank(13.5);
  for(const x of CITY.xRoads){box('white',x,.10,-31,16,.3,216);box('road',x,.29,-31,11.2,.12,216);for(let z=-137;z<60;z+=6)if(!CITY.zRoads.some(v=>Math.abs(v-z)<9))box('line',x,.37,z,.22,.03,2.6);}
  for(const z of CITY.zRoads){box('white',0,.11,z,324,.3,16);box('road',0,.30,z,324,.12,11.2);for(let x=-160;x<160;x+=6)if(!CITY.xRoads.some(v=>Math.abs(v-x)<9))box('line',x,.38,z,2.6,.03,.22);}
  for(const x of CITY.xRoads)for(const z of CITY.zRoads){
    intersections.push({x,z});box('road',x,.38,z,11.3,.1,11.3);
    for(let i=-4;i<=4;i++){box('line',x+i,.46,z-8,.5,.03,3);box('line',x+i,.46,z+8,.5,.03,3);box('line',x-8,.46,z+i,3,.03,.5);box('line',x+8,.46,z+i,3,.03,.5);}
    for(const sx of [-1,1])for(const sz of [-1,1]){cyl('navy',x+sx*7,2.5,z+sz*7,.14,4.7);box('navy',x+sx*7,4.5,z+sz*7,.6,1.75,.6);}
  }
  // Four independent districts, intentionally not the reference image's layout.
  for(const x of [-95,-77,-59]){building(x,-120,11,21,14+((x+95)/18)*5);}
  for(const [x,z,w,d,h] of [[-82,-60,19,27,31],[-57,-44,10,19,19],[-98,-37,9,14,12],[-93,-79,10,12,17],[-16,-66,17,22,57],[9,-57,16,18,79],[-13,-35,17,12,33],[14,-85,12,10,25],[-15,-120,20,22,28],[15,-122,10,19,21],[55,-120,14,20,15],[82,-120,19,21,25],[57,-58,17,22,28],[86,-70,13,22,43],[83,-38,22,12,17]])building(x,z,w,d,h,h>25?'tower':'office');
  building(-81,11,31,27,18);building(-57,22,10,13,10);box('blue',-81,19.5,11,8,.25,2);box('blue',-81,19.5,11,2,.25,8);
  cyl('ivory',-4,.5,13,23,1);cyl('white',-4,5.9,13,20,10.5);cyl('glass',-4,7,13,20.15,2.2);cyl('white',-4,11.5,13,21.2,1);cyl('blue',-4,12.08,13,12,.1);
  for(let i=0;i<24;i++){let a=i*Math.PI/12;box('white',-4+Math.cos(a)*20.2,6,13+Math.sin(a)*20.2,.45,10.7,.45);}
  colliders.push({x:-4,z:13,w:43,d:43,height:12.4});mapBuildings.push({x:-4,z:13,w:42,d:42,h:12});
  // Flight plaza and a low, stepped innovation campus.
  box('ivory',70,.35,12,53,.6,48);cyl('white',70,.8,12,10,1);cyl('blue',70,1.33,12,7.5,.05);
  add('ring','white',70,1.38,12,5.6,5.6,5.6,Math.PI/2);box('line',68.9,1.4,12,.45,.02,4.4);box('line',71.1,1.4,12,.45,.02,4.4);box('line',70,1.4,12,2.4,.02,.45);
  building(89,26,11,13,10);building(89,23,8,8,15);building(55,-2,14,11,8);
  for(let x=128;x<=150;x+=16)for(let z=-125;z<=28;z+=25)building(x,z,9,15,8+((z+125)/25%3)*3);
  for(let z=-122;z<=25;z+=28){building(-141,z,22,16,7);for(let i=0;i<4;i++)box('blue',-148+i*4.5,7.8,z,3.2,.2,11,-.15);}
  // Canal crossings and white arches; all are different from the reference layout.
  function approach(x,z1,y1,z2,y2,w,material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([x-w/2,y1,z1,x+w/2,y1,z1,x-w/2,y2,z2,x+w/2,y2,z2],3));g.setIndex(z2>z1?[0,2,1,1,2,3]:[0,1,2,1,3,2]);g.computeVertexNormals();const m=new T.Mesh(g,mats[material]);m.receiveShadow=true;world.add(m);}
  for(const x of CITY.xRoads){let rz=riverZ(x);box('white',x,5.6,rz,16,.8,45);box('road',x,6.06,rz,11.2,.12,45);for(let z=rz-22;z<=rz+22;z+=5)box('line',x,6.14,z,.2,.02,2.4);
    for(const side of [-1,1]){box('white',x+side*7.25,7,rz,.25,1.5,45);for(const end of [-1,1])cyl('white',x+side*6.7,2.8,rz+end*15,.55,5.6);
      if(x===-42||x===110){let last;for(let i=0;i<=24;i++){let z=rz-19+i*38/24,y=7.2+13*Math.sin(i*Math.PI/24);let p=[x+side*6.7,y,z];if(last)rod(last,p,.24);if(i%3===0)rod([p[0],6.2,z],p,.06,'glass');last=p;}}
      approach(x,rz+side*22,6,rz+side*34,.4,16,'white');approach(x,rz+side*22,6.1,rz+side*34,.5,11.2,'road');
    }
  }
  for(const x of CITY.xRoads){const start=riverZ(x)+22,length=138-start;box('white',x,.13,start+length/2,16,.3,length);box('road',x,.34,start+length/2,11.2,.12,length);for(let z=start+2;z<138;z+=6)box('line',x,.42,z,.2,.02,2.4);}
  box('white',0,.16,124,326,.35,16);box('road',0,.38,124,326,.1,11.2);for(let x=-161;x<161;x+=6)box('line',x,.46,124,2.6,.02,.22);
  // Waterfront port, container stacks, gantry cranes and a small marina.
  box('white',-104,.6,108,85,1.1,18);
  for(let x=-142;x<-62;x+=12)for(let z=108;z<=116;z+=4.1){box(((x+142)/12)%3?'white':'blue',x,1.95,z,9,2.5,3.3);outline(x,z,9,3.3,3.24,.09,'ivory');}
  for(const x of [-128,-83]){for(const dx of [-6,6]){rod([x+dx,1,103],[x+dx,20,103],.55,'blue');rod([x+dx,1,110],[x+dx,20,103],.4,'blue');}box('blue',x,20,96,15,1.3,24);box('blue',x,23,105,5,5,4);rod([x,20,89],[x,5,89],.08,'navy');}
  for(let x=50;x<=90;x+=10){box('white',x,.6,96,2,1,11);box('white',x+3,.7,100,5,.6,1);}
  // Solar garden and slow wind turbines, south of the canal.
  for(let x=-20;x<=72;x+=9)for(const z of [109,115,136]){if(CITY.xRoads.some(r=>Math.abs(r-x)<12))continue;box('blue',x,1.7,z,6.8,.25,4.5,-.12);rod([x-2,.2,z],[x-2,1.7,z],.12);rod([x+2,.2,z],[x+2,1.7,z],.12);for(let j=-2;j<=2;j++)box('glass',x+j*1.2,1.85,z,.045,.03,4.3,-.12);}
  for(const [x,z] of [[96,106],[141,103],[150,137],[85,138]]){cyl('white',x,13,z,.48,26);const pivot=new T.Group();pivot.position.set(x,26,z);world.add(pivot);const hub=new T.Mesh(new T.SphereGeometry(.8,12,8),mats.white);pivot.add(hub);for(let i=0;i<3;i++){const blade=new T.Mesh(new T.BoxGeometry(.65,8,.19),mats.white);blade.position.set(Math.sin(i*2*Math.PI/3)*4,Math.cos(i*2*Math.PI/3)*4,.5);blade.rotation.z=-i*2*Math.PI/3;pivot.add(blade);}windRotors.push(pivot);}
  // Substation and distribution pylons along the western service corridor.
  for(const z of [-90,-53,-16,22]){const x=-161;for(const sx of [-1,1])rod([x+sx*2.2,.4,z],[x+sx*.8,17,z],.16,'navy');for(let h=4;h<=15;h+=4){rod([x-2,h,z],[x+2,h+3,z],.09,'navy');rod([x+2,h,z],[x-2,h+3,z],.09,'navy');}box('navy',x,15,z,8,.3,.4);box('navy',x,18,z,5,.3,.4);if(z<22)for(const dx of [-3,0,3]){const ps=[new T.Vector3(x+dx,16,z),new T.Vector3(x+dx,13,z+18.5),new T.Vector3(x+dx,16,z+37)];world.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(ps),20,.045,4,false),mats.navy));}}
  for(let x=-154;x<=-123;x+=8){cyl('ivory',x,2.5,56,2.5,4.5);box('blue',x,5,56,4.5,.2,4.5);}
  // Streetscape: repeated small trees, lamps, benches, and a river promenade.
  for(const x of CITY.xRoads)for(let z=-132;z<51;z+=14){if(CITY.zRoads.some(v=>Math.abs(v-z)<13))continue;tree(x-10,z,3.7);tree(x+10,z,4.2);cyl('navy',x+7.7,2.7,z+4,.07,5.3);box('white',x+7.7,5.4,z+3.4,.45,.16,1.5);}
  for(let x=-165;x<166;x+=9){const z=riverZ(x)-18;tree(x,z,3.8);if(Math.round(x)%3===0)box('white',x,.9,z-3,3,.5,.8);}
  for(const [cx,cz] of [[-71,-3],[56,31],[88,-2],[-23,38],[33,-133]])for(let i=0;i<7;i++){const a=i*2.399;tree(cx+cos(a)*5,cz+sin(a)*5,3+(i%3)*.6);}
  const extension=extendDistricts({world,mats,box,cyl,add,rod,tree,building,outline,approach,colliders,mapBuildings,intersections});
  // Bake static geometry to a small set of instanced draw calls.
  for(const [key,list] of batches){const [type,mat]=key.split(':');const m=new T.InstancedMesh(geo[type],mats[mat],list.length);list.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.instanceMatrix.needsUpdate=true;m.castShadow=mat!=='line';m.receiveShadow=true;m.name='City '+key;world.add(m);}
  return {world,mats,colliders,mapBuildings,windRotors,intersections,riverZ,...extension,stats:{buildings:mapBuildings.length,intersections:intersections.length,windTurbines:windRotors.length,forestTrees:extension.forestTrees,mountains:extension.mountains.length,landmarks:extension.landmarks.map(l=>l.name),widthMeters:CITY.width,depthMeters:CITY.depth},update(dt){for(const r of windRotors)r.rotation.z-=dt*.22;}};
}
const {sin,cos}=Math;
