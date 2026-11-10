(function(){
 class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z} set(x,y,z){this.x=x;this.y=y;this.z=z;return this} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this} clone(){return new V(this.x,this.y,this.z)}}
 class O{constructor(){this.children=[];this.position=new V();this.rotation=new V();this.scale=new V(1,1,1);this.visible=true;this.userData={};this.up=new V(0,1,0)} add(o){this.children.push(o);return this} remove(o){this.children=this.children.filter(c=>c!==o);return this} traverse(f){f(this);this.children.forEach(c=>c.traverse(f))} lookAt(){} updateProjectionMatrix(){}}
 class G{constructor(...a){this.a=a} translate(){return this} dispose(){}}
 window.THREE={Vector3:V,Vector2:class{constructor(x,y){this.x=x;this.y=y}},Scene:O,Group:O,Mesh:class extends O{constructor(g,m){super();this.geometry=g;this.material=m}},PerspectiveCamera:O,HemisphereLight:O,DirectionalLight:O,GridHelper:class extends O{constructor(){super();this.material={}}},
  BoxGeometry:G,SphereGeometry:G,CylinderGeometry:G,ConeGeometry:G,TorusGeometry:G,PlaneGeometry:G,ExtrudeGeometry:G,LatheGeometry:G,Shape:class{moveTo(){}lineTo(){}},
  MeshStandardMaterial:class{constructor(o){Object.assign(this,o)} dispose(){}},Color:class{constructor(c){this.c=c}},DoubleSide:2,FrontSide:0,sRGBEncoding:3001,
  Box3:class{constructor(){this.e=true;this.min=new V(-1,0,-1);this.max=new V(1,2,1)} expandByObject(){this.e=false;return this} isEmpty(){return this.e} getCenter(t){return t.set(0,1,0)} getSize(t){return t.set(2,2,2)}},
  WebGLRenderer:class{constructor(){this.domElement=document.createElement('canvas');this.outputEncoding=0} setPixelRatio(p){this.pr=p} getPixelRatio(){return this.pr||1} setSize(w,h){this.domElement.width=w;this.domElement.height=h} setClearColor(){} render(){const c=this.domElement.getContext('2d');c.fillStyle='#E5383B';c.fillRect(0,0,this.domElement.width,this.domElement.height);window.__renders=(window.__renders||0)+1}}};
})();
