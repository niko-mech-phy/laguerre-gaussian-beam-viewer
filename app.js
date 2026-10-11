"use strict";
const $ = id => document.getElementById(id);
const PI = Math.PI;
function laguerre(p, alpha, x) {
  let prev = 1, current = 1 + alpha - x;
  if (p === 0) return prev;
  for (let n = 2; n <= p; n++) {
    const next = ((2*n-1+alpha-x)*current - (n-1+alpha)*prev)/n;
    prev = current; current = next;
  }
  return current;
}
function field(b, x, y, z) {
  const s = b.axis === 'x' ? x : b.direction*(z-b.focus);
  const u = b.axis === 'x' ? y : x, v = b.axis === 'x' ? z-b.focus : y;
  const zr = PI*b.waist*b.waist/b.wavelength;
  const w = b.waist*Math.hypot(1,s/zr), r2 = u*u+v*v, order = Math.abs(b.l);
  const rho2 = 2*r2/(w*w);
  let ratio = 1;
  for (let n = b.p+1; n <= b.p+order; n++) ratio /= n;
  const amplitude = Math.sqrt(2*ratio/PI)/w * Math.pow(rho2,order/2) * laguerre(b.p,order,rho2)*Math.exp(-rho2/2);
  const angle = 2*PI*s/b.wavelength + PI*r2*s/(b.wavelength*(s*s+zr*zr)) - (2*b.p+order+1)*Math.atan(s/zr) + b.l*Math.atan2(v,u);
  return [amplitude*Math.cos(angle), amplitude*Math.sin(angle)];
}
function jones(b) {
  const vector = [[0,0],[0,0],[0,0]];
  if (b.polarization.startsWith('Linear ')) vector['XYZ'.indexOf(b.polarization.at(-1))] = [1,0];
  else {
    const indices = b.axis === 'x' ? [1,2] : [0,1];
    vector[indices[0]] = [Math.SQRT1_2,0];
    vector[indices[1]] = [0,(b.polarization === 'Circular +' ? 1 : -1)*Math.SQRT1_2];
  }
  return vector;
}
function multiply(a,b) { return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]]; }
function quantity(a,b,x,y,z,phase,intensity,component) {
  const ea=field(a,x,y,z), eb=field(b,x,y,z), rotated=multiply(eb,[Math.cos(phase),Math.sin(phase)]);
  if (!intensity) {
    const ja=jones(a)[component], jb=jones(b)[component];
    const first=multiply(ea,ja)[0], second=multiply(rotated,jb)[0];
    return [first,second,first+second];
  }
  const first=ea[0]**2+ea[1]**2, second=eb[0]**2+eb[1]**2;
  let cross=0;
  if (Math.abs(a.wavelength-b.wavelength) <= 1e-12*a.wavelength) {
    const ja=jones(a), jb=jones(b);
    for(let c=0;c<3;c++) {
      const product=multiply(ea,ja[c]), other=multiply(rotated,jb[c]);
      cross += product[0]*other[0]+product[1]*other[1];
    }
  }
  return [first,second,Math.max(0,first+second+2*cross)];
}
function number(id) { const value=$(id).value.trim(), n=Number(value); if (!value || !Number.isFinite(n)) throw Error(`${id}: enter a finite number`); return n; }
function settings() {
  const wavelength=number('wavelength')/1000, na=number('na');
  if(wavelength<=0 || na<=0 || na>1) throw Error('Require λ > 0 nm and 0 < NA ≤ 1');
  const beams=[1,2].map(i=>{
    const waist=number('w'+i), p=number('p'+i), l=number('l'+i);
    if(waist<=0 || !Number.isInteger(p) || !Number.isInteger(l) || p<0 || p>20 || Math.abs(l)>20) throw Error(`Beam ${i}: require w₀ > 0, integer 0 ≤ p ≤ 20 and |l| ≤ 20`);
    const axis=i===2 ? $('direction').value : 'z', polarization=$('pol'+i).value;
    if(axis==='x' && polarization==='Linear X') throw Error('Beam 2: choose a transverse polarization');
    return {wavelength,waist,p,l,axis,polarization,direction:i===2 && axis==='z' ? -1 : 1,focus:0};
  });
  const phase=number('phase')*PI/180, viewX=number('viewX'), viewZ=number('viewZ');
  if(viewX<=0 || viewZ<=0) throw Error('View half-widths must be positive');
  return {beams,phase,viewX,viewZ,colormap:$('colormap').value,intensity:$('quantity').value==='intensity',component:'XYZ'.indexOf($('component').value)};
}
function palette(t,name) {
  const samples=colormapSamples[name] || colormapSamples.viridis;
  const index=Math.min(255,Math.max(0,Math.floor(t*256)))*6;
  return [0,2,4].map(offset=>parseInt(samples.slice(index+offset,index+offset+2),16));
}
function paint(canvas, values, width,height,scale,colormap,intensity,phase=false) {
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d'), img=ctx.createImageData(width,height);
  for(let i=0;i<values.length;i++) {
    const value=values[i];
    let rgb;
    if(phase) {
      if(value===null) rgb=[242,245,248];
      else { const angle=(value+PI)/(2*PI); rgb=hsl((angle*360+240)%360,70,50); }
    } else {
      const n=Math.min(1,Math.abs(value)/scale);
      rgb=palette(intensity?n:(1+Math.sign(value)*n)/2,colormap);
    }
    const idx=4*i; img.data[idx]=rgb[0]; img.data[idx+1]=rgb[1]; img.data[idx+2]=rgb[2]; img.data[idx+3]=255;
  }
  ctx.putImageData(img,0,0);
}
function hsl(h,s,l) {
  const a=s*Math.min(l,100-l)/100;
  return [0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round((l-a*Math.max(-1,Math.min(k-3,9-k,1)))*2.55);});
}
function rowData(config,width,height,xy) {
  const arrays=[new Float64Array(width*height),new Float64Array(width*height),new Float64Array(width*height)];
  let scale=0;
  for(let j=0;j<height;j++) for(let i=0;i<width;i++) {
    const x=(2*(i+.5)/width-1)*config.viewX*config.beams[0].wavelength;
    const v=(1-2*(j+.5)/height)*(xy?config.viewX:config.viewZ)*config.beams[0].wavelength;
    const sample=quantity(...config.beams,x,xy?v:0,xy?0:v,config.phase,config.intensity,config.component);
    const idx=j*width+i;
    for(let c=0;c<3;c++) {arrays[c][idx]=sample[c];scale=Math.max(scale,Math.abs(sample[c]));}
  }
  return {arrays,scale:scale||1};
}
function drawAxes(canvas,image,config,xy) {
  const left=55, top=13, right=16, bottom=52, width=image.width;
  const height=xy ? width : Math.max(1,Math.round(width*config.viewZ/config.viewX));
  canvas.width=left+width+right;canvas.height=top+height+bottom;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,left,top,width,height);
  if(!xy) {ctx.strokeStyle='rgba(255,255,255,.75)';ctx.beginPath();ctx.moveTo(left,top+height/2);ctx.lineTo(left+width,top+height/2);ctx.stroke();}
  const maxY=xy?config.viewX:config.viewZ;
  const format=n=>Number(n.toFixed(2)).toString();
  function ticks(max,size,origin,vertical) {
    const step=Math.pow(10,Math.floor(Math.log10(max)));
    const interval=[1,2,5,10].map(n=>n*step).find(n=>max/n<=3) || 10*step;
    for(let v=-Math.floor(max/interval)*interval;v<=max+interval*1e-8;v+=interval) {
      const pos=origin+size*(v/max+1)/2;
      ctx.beginPath();
      if(vertical){const y=origin+size*(1-v/max)/2;ctx.moveTo(left-5,y);ctx.lineTo(left,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(format(v),left-8,y+4);}
      else {ctx.moveTo(pos,top+height);ctx.lineTo(pos,top+height+5);ctx.stroke();ctx.textAlign='center';ctx.fillText(format(v),pos,top+height+19);}
    }
  }
  ctx.strokeStyle='#263953';ctx.fillStyle='#263953';ctx.lineWidth=1;ctx.font='13px sans-serif';
  ctx.strokeRect(left+.5,top+.5,width,height);
  ticks(config.viewX,width,left,false);ticks(maxY,height,top,true);
  ctx.textAlign='center';ctx.fillText('x / λ',left+width/2,canvas.height-9);
  ctx.save();ctx.translate(16,top+height/2);ctx.rotate(-Math.PI/2);ctx.fillText(xy?'y / λ':'z / λ',0,0);ctx.restore();
}function draw() {
  try {
    const config=settings(); if(config.colormap==='auto') config.colormap=config.intensity?'viridis':'RdBu_r'; $('error').textContent='';
    const plots=$('plots'); plots.replaceChildren();
    for(const xy of [false,true]) {
      const width=xy?240:320,height=xy?240:600;
      const {arrays,scale}=rowData(config,width,height,xy);
      for(let c=0;c<3;c++) {
        const box=document.createElement('div'), title=document.createElement('strong'), canvas=document.createElement('canvas'), caption=document.createElement('small');
        box.className='plot'; title.textContent=(c===0?'Beam 1 (+z)':c===1?`Beam 2 (${config.beams[1].axis==="x"?'+x':'−z'})`:'Combined')+(xy?' : x–y at z / λ = 0':' : x–z');
        const image=document.createElement('canvas');
        paint(image,arrays[c],width,height,scale,config.colormap,config.intensity);
        drawAxes(canvas,image,config,xy);
        box.append(title,canvas);plots.append(box);
      }
    }
    $('scaleLabel').textContent=(config.intensity?'Intensity / displayed maximum':`Re(E${$('component').value}) at t=0 / max |E${$('component').value}|`)+` · ${config.colormap}`;
    $('low').textContent=config.intensity?'0':'−1';$('high').textContent='1';
    const bar=$('colorbar'), ctx=bar.getContext('2d');
    for(let i=0;i<bar.width;i++){ctx.fillStyle=`rgb(${palette(i/(bar.width-1),config.colormap).join(',')})`;ctx.fillRect(i,0,1,bar.height);}
    $('beamArrows').textContent=`🔵 1: +z ↑ · 🔴 2: ${config.beams[1].axis==='x'?'+x →':'−z ↓'}`;
  } catch(error) { $('error').textContent=error.message; }
}
function gallery() {
  const tiles=$('tiles'), phase=$('galleryQuantity').value==='Phase'; tiles.replaceChildren();
  const size=161;
  for(let p=0;p<=4;p++) for(let l=0;l<=4;l++) {
    const tile=document.createElement('button'), title=document.createElement('strong'), canvas=document.createElement('canvas');
    tile.className='tile';title.textContent=`p=${p}, |l|=${l}`;
    const beam={wavelength:1,waist:1,p,l,axis:'z',direction:1,focus:0};
    const values=new Array(size*size);let max=0;
    for(let j=0;j<size;j++) for(let i=0;i<size;i++) {
      const x=(2*i/(size-1)-1)*3.5,y=(1-2*j/(size-1))*3.5;
      const e=field(beam,x,y,0),m=Math.hypot(...e),index=j*size+i;
      values[index]=phase?{m,angle:Math.atan2(e[1],e[0])}:m*m;
      max=Math.max(max,m);
    }
    const data=phase?values.map(v=>v.m<.03*max?null:v.angle):values;
    paint(canvas,data,size,size,phase?1:max*max,'inferno',true,phase);
    tile.append(title,canvas); tile.addEventListener('click',()=>{$('galleryDetails').textContent=`LG(${p},${l}): ${p} radial node(s), charge ±${l}, M² = ${2*p+l+1}; negative charge reverses phase winding.`;});
    tiles.append(tile);
  }
}
function updateOptics() {
  const wavelength=Number($('wavelength').value),na=Number($('na').value);
  $('estimate').textContent=wavelength>0 && na>0 && na<=1 ? `Waist estimate λ/(π NA) ≈ ${(wavelength/(PI*na)).toFixed(1)} nm`:'Enter λ > 0 nm and 0 < NA ≤ 1';
}
function updateDirection() {
  const select=$('pol2'), old=select.value, orthogonal=$('direction').value==='x';
  select.replaceChildren();
  for(const name of [orthogonal?'Linear Y':'Linear X',orthogonal?'Linear Z':'Linear Y','Circular +','Circular -']) select.add(new Option(name,name));
  if([...select.options].some(option=>option.value===old)) select.value=old;
  if(orthogonal && $('component').value==='X') $('component').value='Y';
  draw();
}
$('controls').addEventListener('submit',event=>{event.preventDefault();draw();});
$('direction').addEventListener('change',updateDirection);
$('quantity').addEventListener('change',()=>{$('component').disabled=$('quantity').value==='intensity';draw();});
for(const id of ['wavelength','na']) $(id).addEventListener('input',updateOptics);
$('galleryQuantity').addEventListener('change',gallery);
for(const [tab,show,hide] of [['viewerTab','viewer','gallery'],['galleryTab','gallery','viewer']]) $(tab).addEventListener('click',()=>{$(show).hidden=false;$(hide).hidden=true;$(tab).classList.add('active');$(show==='viewer'?'galleryTab':'viewerTab').classList.remove('active');});
$('save').addEventListener('click',()=>{
  if(!$('plots').children.length) return;
  const source=[...$('plots').querySelectorAll('canvas')], width=1200,height=1420, exportCanvas=document.createElement('canvas');
  exportCanvas.width=width;exportCanvas.height=height;
  const ctx=exportCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#17243b';ctx.font='bold 24px sans-serif';ctx.fillText('Laguerre–Gaussian beam viewer',20,34);
  ctx.font='16px sans-serif';ctx.fillText($('scaleLabel').textContent,20,62);
  source.forEach((canvas,i)=>{
    const col=i%3,row=Math.floor(i/3),x=20+col*390,y=row?890:90,w=375,h=row?450:770;
    const factor=Math.min(w/canvas.width,h/canvas.height),drawW=canvas.width*factor,drawH=canvas.height*factor;
    ctx.drawImage(canvas,x+(w-drawW)/2,y,drawW,drawH);
    ctx.fillStyle='#17243b';ctx.font='14px sans-serif';ctx.fillText($('plots').children[i].querySelector('strong').textContent,x,y-5);
  });
  ctx.fillStyle='#17243b';ctx.font='16px sans-serif';ctx.fillText($('low').textContent,360,1390);ctx.drawImage($('colorbar'),390,1372,410,20);ctx.fillText($('high').textContent,810,1390);
  const link=document.createElement('a');link.download='laguerre-gaussian-beams.png';link.href=exportCanvas.toDataURL('image/png');link.click();
});
updateOptics();draw();gallery();


