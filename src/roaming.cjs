'use strict';
function clampPosition(bounds,area){return{x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+Math.max(0,area.width-bounds.width)))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+Math.max(0,area.height-bounds.height))))};}
class RoamingController{
 constructor({enabled=true,now=Date.now(),random=Math.random}={}){this.enabled=enabled!==false;this.random=random;this.nextAt=now+30000;this.target=null;this.lastAt=now;this.manual=false;this.moving=false;this.direction='right';}
 setEnabled(value,now=Date.now()){if(typeof value!=='boolean')throw Error('散步开关须为布尔值');this.enabled=value;this.hold(now,30000);}
 requestWalk(now=Date.now()){if(!this.enabled)throw Error('请先开启自动散步');this.manual=true;this.nextAt=now;}
 hold(now=Date.now(),delay=15000){this.target=null;this.manual=false;this.moving=false;this.nextAt=now+delay;this.lastAt=now;}
 step({now=Date.now(),bounds,area,working=false,blocked=false}){
  const wasMoving=this.moving;
  if(!this.enabled||blocked){this.target=null;this.moving=false;this.nextAt=now+15000;this.lastAt=now;return{moving:false,changed:wasMoving};}
  if(this.target===null){
   if((!working&&!this.manual)||(!this.manual&&now<this.nextAt)){this.lastAt=now;return{moving:false,changed:false};}
   const p=clampPosition(bounds,area),min=area.x,max=area.x+Math.max(0,area.width-bounds.width),distance=90+Math.floor(this.random()*60);
   const preferred=this.random()<.5?-1:1;let direction=preferred;
   if(direction<0&&p.x-min<30)direction=1;if(direction>0&&max-p.x<30)direction=-1;
   this.target=Math.max(min,Math.min(max,p.x+direction*distance));this.manual=false;
   if(Math.abs(this.target-p.x)<2){this.target=null;this.nextAt=now+30000;this.lastAt=now;return{moving:false,changed:false};}
   this.direction=this.target<p.x?'left':'right';this.moving=true;this.lastAt=now;
   return{...p,moving:true,changed:true,direction:this.direction};
  }
  // Never catch up a sleep/resume gap with a large jump.
  const dt=Math.max(0,Math.min(200,now-this.lastAt));this.lastAt=now;
  const p=clampPosition(bounds,area);const target=Math.max(area.x,Math.min(this.target,area.x+Math.max(0,area.width-bounds.width)));
  const step=18*dt/1000;const x=p.x+Math.sign(target-p.x)*Math.min(Math.abs(target-p.x),step);
  const next=clampPosition({...bounds,x,y:p.y},area);
  if(Math.abs(target-next.x)<2){this.target=null;this.moving=false;this.nextAt=now+30000+Math.floor(this.random()*20000);return{...next,moving:false,changed:true};}
  return{...next,moving:true,changed:false,direction:this.direction};
 }
}
module.exports={RoamingController,clampPosition};
