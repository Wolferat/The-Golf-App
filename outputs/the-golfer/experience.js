/* Shared, local-only motion. No analytics, AI requests, or third-party assets. */
(() => {
  'use strict';
  const localURL=new URL(location.href);
  const isLocal=url=>url.protocol===localURL.protocol&&url.host===localURL.host;
  window.golfolioNavigate=href=>location.assign(href);
  let pending=0, onPending=()=>{};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,options){
    let track=false;
    try{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);track=isLocal(url)&&url.pathname.startsWith('/api/');}catch{}
    if(!track)return nativeFetch(input,options);
    pending++;onPending();
    return nativeFetch(input,options).finally(()=>{pending--;onPending();});
  };
  function mount(){
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // A ray/sphere shader with spherical rows of recessed dimples. Lighting remains
  // fixed for a stationary branded ball; no texture download or 3D engine needed.
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `precision mediump float;
    varying vec2 uv; uniform float angle;
    const float PI=3.14159265;
    float cavity(vec3 p){
      float lat=acos(clamp(p.y,-.9999,.9999));
      float row=floor(lat/PI*19.);
      float center=(row+.5)*PI/19.;
      float count=max(3.,floor(38.*sin(center)));
      float lon=atan(p.z,p.x)+angle;
      float x=(fract(lon/(2.*PI)*count+mod(row,2.)*.5)-.5)*2.*PI/count*sin(center);
      float y=lat-center;
      float d=length(vec2(x,y))/.070;
      return -.014*pow(max(0.,1.-d*d),2.);
    }
    void main(){
      vec2 q=uv*1.035; float r=dot(q,q);
      if(r>1.)discard;
      vec3 p=vec3(q.x,q.y,sqrt(1.-r));
      vec3 t=normalize(cross(vec3(0.,1.,.001),p)); vec3 b=cross(p,t);
      float e=.006;
      float dt=(cavity(normalize(p+t*e))-cavity(normalize(p-t*e)))/(2.*e);
      float db=(cavity(normalize(p+b*e))-cavity(normalize(p-b*e)))/(2.*e);
      vec3 n=normalize(p-t*dt-b*db);
      vec3 light=normalize(vec3(-.65,.85,1.2));
      float diffuse=max(0.,dot(n,light));
      float spec=pow(max(0.,dot(n,normalize(light+vec3(0.,0.,1.)))),45.);
      float rim=pow(1.-max(0.,p.z),3.);
      vec3 color=vec3(.89,.865,.77)*(.32+.80*diffuse)+vec3(.22,.26,.20)*max(0.,-n.y)*.28+spec*.19+rim*vec3(.09,.13,.09);
      color*=1.+cavity(p)*3.;
      gl_FragColor=vec4(color,smoothstep(1.,.989,r));
    }`;
  function initBall(host) {
    if (host.dataset.ballReady) return;
    host.dataset.ballReady = 'true';
    const logo = document.createElement('span');
    logo.className = 'golf-ball-logo';
    logo.textContent = 'Golfolio';
    logo.setAttribute('aria-hidden', 'true');
    host.append(logo);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    let gl;
    try { gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false, powerPreference:'low-power'}); } catch { return; }
    if (!gl) return; // CSS sphere remains usable on devices without WebGL.
    const shader = (type, source) => {
      const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error('Sphere shader unavailable');}
      return s;
    };
    let program;
    try {
      program=gl.createProgram();
      const vs=shader(gl.VERTEX_SHADER,vertex), fs=shader(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Sphere unavailable');
    } catch { return; }
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    const angle=gl.getUniformLocation(program,'angle');
    const draw=()=>{
      const size=Math.min(480,Math.max(96,Math.round(host.clientWidth*Math.min(devicePixelRatio||1,2))));
      if(canvas.width!==size){canvas.width=canvas.height=size;gl.viewport(0,0,size,size);}
      gl.uniform1f(angle,0);gl.drawArrays(gl.TRIANGLES,0,6);
    };
    host.append(canvas);host.classList.add('rendered');
    // Draw only when the element changes size. There is no continuous render loop.
    const observer=new ResizeObserver(draw);observer.observe(host);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();observer.disconnect();host.classList.remove('rendered');canvas.remove();});
    draw();
  }
  document.querySelectorAll('[data-golf-ball]').forEach(initBall);

  const busy=document.createElement('div');
  busy.className='experience-busy';busy.hidden=true;busy.setAttribute('role','status');busy.setAttribute('aria-live','polite');
  busy.innerHTML='<div class="golf-ball" data-golf-ball aria-hidden="true"></div><span>Loading your golf…</span>';
  document.body.append(busy);
  let showTimer,visibleTimer;
  onPending=()=>{
    if(pending===0){clearTimeout(showTimer);showTimer=null;clearTimeout(visibleTimer);busy.hidden=true;return;}
    if(showTimer||!busy.hidden)return;
    showTimer=setTimeout(()=>{
      if(pending){busy.hidden=false;initBall(busy.querySelector('.golf-ball'));visibleTimer=setTimeout(()=>{busy.hidden=true;},15000);}
    },450);
  };
  onPending();

  const drive=document.createElement('div');drive.className='drive-transition';drive.hidden=true;drive.setAttribute('aria-hidden','true');
  drive.innerHTML='<div class="golf-ball"></div>';document.body.append(drive);
  let navigationTimer;
  window.golfolioNavigate=href=>{
    const url=new URL(href,location.href);
    location.assign(url.href);
  };
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a[href]');
    if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self')||motion.matches)return;
    const url=new URL(link.href,location.href);
    if(!isLocal(url)||url.pathname.startsWith('/api/')||url.href===location.href||url.pathname===location.pathname&&url.search===location.search)return;
    event.preventDefault();window.golfolioNavigate(url.href);
  });
  addEventListener('pageshow',()=>{clearTimeout(navigationTimer);navigationTimer=null;drive.hidden=true;drive.classList.remove('driving');busy.hidden=true;});

  // Existing dialogs retain their handlers; give each the same keyboard affordances.
  let activeModal=null,returnFocus=null;
  const syncDialogs=()=>{
    const modal=document.querySelector('.modal.open');
    if(modal===activeModal)return;
    if(!activeModal&&modal)returnFocus=document.activeElement;
    activeModal=modal;
    if(modal){
      const dialog=modal.querySelector('.dialog');
      if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');const title=dialog.querySelector('h2');if(title){if(!title.id)title.id='dialog-title-'+modal.id;dialog.setAttribute('aria-labelledby',title.id);}}
      (modal.querySelector('input:not([type=checkbox])')||modal.querySelector('button'))?.focus({preventScroll:true});
    }else if(returnFocus?.isConnected){returnFocus.focus({preventScroll:true});returnFocus=null;}
  };
  const observer=new MutationObserver(syncDialogs);
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  syncDialogs();
  document.addEventListener('keydown',event=>{
    const modal=document.querySelector('.modal.open');if(!modal)return;
    if(event.key==='Escape'){modal.querySelector('.close')?.click();return;}
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);if(!first)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
