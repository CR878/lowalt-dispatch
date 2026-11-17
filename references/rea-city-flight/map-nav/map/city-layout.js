// Shared metre-scale layout for geometry, navigation and moving road traffic.
export const CITY={width:1100,depth:800,xRoads:[-112,-42,34,110],zRoads:[-94,-20,46],start:{x:70,y:24,z:12}};
export const riverZ=x=>85+Math.sin((x+45)*.014)*3;
export const STREETS=[
  ...[-430,-316,-190,-112,-42,34,110,190,316,430].map(x=>({id:`avenue-${x}`,axis:'z',at:x,min:-174,max:274})),
  ...[-160,-94,-20,46,124,252].map(z=>({id:`street-${z}`,axis:'x',at:z,min:-455,max:[46,124].includes(z)?162:455})),
  {id:'skyway-inner',axis:'x',at:205,min:-540,max:540,height:18.27,lane:2.75},
  {id:'skyway-outer',axis:'x',at:205,min:-540,max:540,height:18.27,lane:7.8}
];
export function bridgeLift(x,z){const d=Math.abs(z-riverZ(x));return d<=22?5.72:d>=34?0:(34-d)/12*5.72;}
export function roadLift(road,x,z){return road.height|| (road.axis==='z'?bridgeLift(road.at,z):0);}
