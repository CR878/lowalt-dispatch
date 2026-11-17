import * as T from 'three';

// The reference panorama's nine application names, anchored to explorable
// districts rather than flattened into a backdrop image.
const APPLICATIONS=[
  {name:'运载',x:-392,z:-60,rx:76,rz:56,labelY:51},
  {name:'公共安全',x:-242,z:-120,rx:67,rz:54,labelY:57},
  {name:'应急消防',x:-245,z:20,rx:73,rz:59,labelY:52},
  {name:'交通管理',x:42,z:207,rx:94,rz:44,labelY:52},
  {name:'水利应用',x:251,z:61,rx:81,rz:65,labelY:53},
  {name:'农业',x:-401,z:305,rx:113,rz:67,labelX:-258,labelY:90},
  {name:'自然资源',x:-489,z:-71,rx:68,rz:79,labelY:87},
  {name:'城市治理',x:397,z:-125,rx:105,rz:84,labelY:67},
  {name:'消费航拍',x:116,z:-257,rx:112,rz:52,labelY:98}
];

function labelTexture(text){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=152;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(0,102,160,.94)';ctx.fillRect(0,12,768,128);
  ctx.fillStyle='#49e5f3';ctx.fillRect(0,12,9,128);
  ctx.fillStyle='rgba(255,255,255,.21)';ctx.fillRect(31,112,706,2);
  ctx.fillStyle='#fff';ctx.font='700 61px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`低空经济 + ${text}`,388,72,700);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;return texture;
}

function dashedCorridor(points){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  const geometry=new T.BufferGeometry().setFromPoints(curve.getPoints(160));
  const material=new T.LineDashedMaterial({color:0xffe45e,dashSize:4,gapSize:3,transparent:true,opacity:.82,depthWrite:false});
  const line=new T.Line(geometry,material);line.computeLineDistances();line.name='Conceptual low-altitude flight corridor';
  return line;
}

export function buildAtmosphere(scene){
  const group=new T.Group();group.name='Low-altitude application atmosphere';scene.add(group);
  const zones=APPLICATIONS.map((item,index)=>{
    const fill=new T.Mesh(new T.CircleGeometry(1,72),new T.MeshBasicMaterial({color:0x19cee4,side:T.DoubleSide,transparent:true,opacity:.21,depthWrite:false}));
    fill.rotation.x=-Math.PI/2;fill.position.set(item.x,.53,item.z);fill.scale.set(item.rx,item.rz,1);fill.renderOrder=3;fill.name=`${item.name}覆盖区`;group.add(fill);
    const canopy=new T.Mesh(new T.CircleGeometry(1,72),new T.MeshBasicMaterial({color:0x1ac9e8,side:T.DoubleSide,transparent:true,opacity:.11,depthWrite:false}));
    canopy.rotation.x=-Math.PI/2;canopy.position.set(item.x,20,item.z);canopy.scale.set(item.rx*.88,item.rz*.88,1);canopy.renderOrder=5;canopy.name=`${item.name}低空覆盖层`;group.add(canopy);
    const points=[];for(let i=0;i<=96;i++){const angle=i*Math.PI*2/96;points.push(item.x+Math.cos(angle)*item.rx,.59,item.z+Math.sin(angle)*item.rz);}
    const rim=new T.Line(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3)),new T.LineBasicMaterial({color:0x07b8d6,transparent:true,opacity:.6,depthWrite:false}));
    rim.renderOrder=4;group.add(rim);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:labelTexture(item.name),transparent:true,depthWrite:false}));
    sprite.position.set(item.labelX??item.x,item.labelY,item.z);sprite.scale.set(58,11.5,1);sprite.name=`低空经济标注 · ${item.name}`;group.add(sprite);
    return {fill,canopy,rim,sprite,baseY:item.labelY,offset:index*1.3};
  });
  group.add(dashedCorridor([[-81,45,11],[-17,94,-6],[114,99,-39],[250,52,-118]]));
  group.add(dashedCorridor([[-247,38,16],[-174,62,-1],[-68,89,-48],[85,71,-71]]));
  group.add(dashedCorridor([[-410,29,321],[-333,42,242],[-242,46,18],[-112,51,-69]]));
  group.add(dashedCorridor([[389,45,-216],[306,63,-255],[118,88,-260],[-80,77,-172]]));
  let elapsed=0;
  const projected=new T.Vector3();
  return {group,zones,update(dt,show,paused,reducedMotion,camera,showTitles=true){
    group.visible=show;
    if(!show)return;
    if(!paused&&!reducedMotion)elapsed+=dt;
    for(const zone of zones){const wave=reducedMotion?0:Math.sin(elapsed*.65+zone.offset);
      zone.fill.material.opacity=.2+.03*wave;
      zone.canopy.material.opacity=.1+.02*wave;
      zone.rim.material.opacity=.49+.14*wave;
      zone.sprite.position.y=zone.baseY+(paused?0:.5*wave);
      const distance=camera.position.distanceTo(zone.sprite.position),width=Math.max(25,Math.min(146,distance*.15));
      zone.sprite.scale.set(width,width*152/768,1);
      projected.copy(zone.sprite.position).project(camera);
      zone.sprite.visible=showTitles&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.9&&Math.abs(projected.y)<.8;
    }
  }};
}
