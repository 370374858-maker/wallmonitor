import {SOIL_LAYERS} from './soil-config.js';
import {FONT_SIZE} from '../typography.js';
import {esc} from '../workbench/format.js';

export function soilLabelWidth(fontSize=FONT_SIZE.meta) {
  return Math.max(...SOIL_LAYERS.map(layer=>layer.label.split(' ').slice(1).join(' ').length))*fontSize;
}

                                                                          
                                                                                   
export function externalSoilLabelLayout(spec,project,bounds,{height}) {
  if(!bounds)return [];
  const layers=[...SOIL_LAYERS].reverse(),total=layers.reduce((sum,l)=>sum+l.weight,0);
  const fontSize=Math.min(FONT_SIZE.meta,Math.max(8,(height-72)/15));
  const minY=52+fontSize,maxY=Math.max(minY,height-fontSize-10);
  const gap=Math.min(fontSize*2+8,(maxY-minY)/(layers.length-1));
  let top=0,previous=minY-gap;
  const items=layers.map(layer=>{
    const h=spec.height*layer.weight/total;
    const [,sourceY]=project(spec.soilLeft+spec.soilWidth,top-h/2,-(spec.slot.thickness/2+.01+3)/2);top-=h;
    const [code,...name]=layer.label.split(' ');
    const y=Math.max(minY,sourceY,previous+gap);previous=y;
    return {id:layer.id,code,name:name.join(' '),x:bounds.right+12,y,sourceY,fontSize};
  });
  items.at(-1).y=Math.min(items.at(-1).y,maxY);
  for(let i=items.length-2;i>=0;i--)items[i].y=Math.min(items[i].y,items[i+1].y-gap);
  return items;
}

export function externalSoilLabels(spec,project,bounds,viewport) {
  const items=externalSoilLabelLayout(spec,project,bounds,viewport);
  return '<g class="scene-soil-labels">'+items.map(item=>{
    const line=item.fontSize+4;
    return `<g data-soil-label="${esc(item.id)}"><path d="M${item.x-9} ${item.y}h5" stroke="#fff" stroke-opacity=".5"/><text x="${item.x}" y="${item.y-line/2}" text-anchor="start" dominant-baseline="middle" fill="#fff" stroke="none" font-size="${item.fontSize}"><tspan x="${item.x}">${esc(item.code)}</tspan><tspan x="${item.x}" dy="${line}">${esc(item.name)}</tspan></text></g>`;
  }).join('')+'</g>';
}
