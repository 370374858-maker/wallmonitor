import { Mesh, PlaneGeometry, ShaderMaterial, Color } from 'three';

                                                                          
                                                                                
export function createSceneFloor(spec, own = value => value) {
  const radius=Math.max(10,spec.soilWidth*1.2,spec.slot.thickness+6);
  const material=own(new ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{radius:{value:radius},spacing:{value:1},blue:{value:new Color('#36baff')},time:{value:0},pulseEnabled:{value:0}},
    vertexShader:`varying vec2 gridPosition;
      void main(){gridPosition=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 gridPosition;
      uniform float radius;uniform float spacing;uniform vec3 blue;
      uniform float time;uniform float pulseEnabled;
      void main(){
        vec2 coord=gridPosition/spacing;
        vec2 pixels=max(fwidth(coord),vec2(0.0001));
        vec2 lines=abs(fract(coord-0.5)-0.5)/pixels;
        float line=1.0-smoothstep(0.0,1.15,min(lines.x,lines.y));
        float fade=1.0-smoothstep(radius*0.12,radius,length(gridPosition));
        // A soft radial wave lights the grid from the model centre outwards.
        float phase=mod(length(gridPosition)-time*2.2,radius*1.15);
        float distanceToWave=min(phase,radius*1.15-phase);
        float wave=exp(-pow(distanceToWave/0.8,2.0))*pulseEnabled;
        float halo=1.0-smoothstep(0.0,3.2,min(lines.x,lines.y));
        float alpha=fade*(line*(0.52+wave*0.4)+halo*wave*0.16);
        if(alpha<0.002)discard;
        gl_FragColor=vec4(mix(blue,vec3(0.65,0.94,1.0),wave*0.7),min(alpha,0.95));
        #include <colorspace_fragment>
      }`
  }));
  const floor=new Mesh(own(new PlaneGeometry(radius*2,radius*2)),material);
  floor.rotation.x=-Math.PI/2;
  floor.position.set(spec.centerX,-spec.height-.035,-spec.slot.thickness/4);
  floor.name='metre-grid-floor';floor.userData.spacingMetres=1;
  return floor;
}
