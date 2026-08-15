(()=>{
  const $=s=>document.querySelector(s), page=document.body.dataset.page;
  const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const avatar=x=>String(x?.avatar||x?.username||'G').slice(0,1).toUpperCase();
  let session, profile;
  try{session=JSON.parse(localStorage.getItem('golfolio_session')||'null')}catch{}
  if(!session?.access_token){location.replace('/?login=1&returnTo='+encodeURIComponent(location.pathname));return}

  const api=async(path='',options={})=>{
    const r=await fetch('/api/player'+path,{...options,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.headers||{})}});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'Could not load player information.');
    return d;
  };
  const settingsApi=async(options={})=>{
    const r=await fetch('/api/settings',{...options,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'Could not load settings.');
    return d;
  };
  const companyApi=async(options={})=>{
    const r=await fetch('/api/company',{...options,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'Could not load company settings.');
    return d;
  };
  const config=async()=>{
    const r=await fetch('/api/config'), d=await r.json();
    if(!r.ok)throw Error('Account settings are unavailable.');
    return d;
  };

  const setAccountMenu=p=>{
    const button=$('#signOut');
    if(!button)return;
    const name=p?.username||'My profile';
    button.textContent=name;
    button.onclick=()=>{
      let menu=$('#pageAccountMenu');
      if(!menu){
        menu=document.createElement('div');
        menu.id='pageAccountMenu';
        menu.className='account-menu';
        button.parentElement.append(menu);
      }
      menu.innerHTML=`<span class="menu-note">Signed in as ${escape(name)}</span><a href="/">Home</a><a href="/hub">My game</a><a href="/players">Find players</a><a href="/settings">Settings</a>${p?.role==='admin'?'<a href="/company">Company settings</a><a href="/review">Review pending listings</a>':''}<button type="button" id="menuSignOut">Sign out</button>`;
      menu.classList.toggle('hidden');
      $('#menuSignOut').onclick=()=>{localStorage.removeItem('golfolio_session');location.assign('/')};
    };
  };

  const menuStyle=document.createElement('style');
  menuStyle.textContent='.top-actions{position:relative}.account-menu{position:absolute;top:52px;right:0;z-index:8;width:232px;padding:10px;border:1px solid #e2e8df;border-radius:17px;background:#fff;box-shadow:0 18px 45px rgba(5,27,17,.2)}.account-menu.hidden{display:none}.account-menu .menu-note{display:block;padding:7px 12px 12px;color:#65776d;font:11px/1.3 DM Mono,monospace}.account-menu a,.account-menu button{display:block;width:100%;padding:11px 12px;border:0;border-radius:10px;background:transparent;color:#102c22;font:800 14px DM Sans,sans-serif;text-align:left;text-decoration:none}.account-menu a:hover,.account-menu button:hover{background:#e6f6e9}';
  document.head.append(menuStyle);

  const headerAccount=$('#signOut');
  if(headerAccount)headerAccount.textContent='Account';

  const navIcons={
    home:'<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/></svg>',
    game:'<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"/><path d="M6 6c4-2 7 1 12-1v6c-5 2-8-1-12 1"/><path d="M3 20h5"/></svg>',
    players:'<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 15c2.7.2 4.4 1.8 5 5"/></svg>'
  };
  const cleanNav=document.querySelector('.mobile-nav');
  if(cleanNav){
    const active=page==='game'?'game':page==='players'?'players':'';
    cleanNav.innerHTML=[['home','Home','/'],['game','My game','/hub'],['players','Players','/players']].map(([key,label,href])=>`<a href="${href}" class="${active===key?'active':''}">${navIcons[key]}<span class="nav-label">${label}</span></a>`).join('');
  }
  const cleanNavStyle=document.createElement('style');
  cleanNavStyle.textContent='.mobile-nav .nav-icon{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.mobile-nav .nav-label{font:700 11px/1.1 DM Sans,sans-serif!important}';
  document.head.append(cleanNavStyle);

  const homeTheme=document.createElement('style');
  homeTheme.textContent=`:root{--ink:#102c22;--forest:#0b2119;--green:#178357;--green-dark:#0f6241;--lime:#d8f7a2;--gold:#e7b542;--cream:#f6f5ef;--paper:#fbfbf7;--line:#e2e8df;--muted:#65776d;--white:#fff;--shadow:0 18px 55px rgba(15,48,35,.10)}body{background:var(--paper);letter-spacing:-.01em}.top{min-height:76px;padding:0 max(28px,calc((100% - 1280px)/2));background:rgba(11,33,25,.98);border-bottom:1px solid rgba(216,247,162,.14)}.brand{font-family:'Playfair Display',Georgia,serif;font-size:28px;letter-spacing:-1.4px}.top-note{font-size:13px;font-weight:500;color:#c6d5ca}.button{min-height:44px;padding:11px 18px;border-radius:999px;transition:transform .18s ease,background .18s ease,box-shadow .18s ease}.button.light{border-color:rgba(255,255,255,.35)}.button.ghost{border-color:#d5e7d9;background:#edf5ef;color:var(--green)}.shell{max-width:1280px;padding:62px 28px 90px}.page-head{margin-bottom:25px}.page-head h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(44px,5.2vw,66px);font-weight:600;letter-spacing:-.055em}.page-head p{font-size:16px;line-height:1.6}.kicker{font-family:'DM Mono',monospace}.card{border-color:var(--line);border-radius:22px;box-shadow:0 8px 24px rgba(17,54,36,.045)}.card.dark{background:linear-gradient(115deg,#0c2b20,#174b35)}.card h2{font-family:'Playfair Display',Georgia,serif;letter-spacing:-.045em}.stat{background:#f2f7f1}.hole-switch{background:#eff4ef}.round-note{background:#f2f7f1}.mobile-nav{border-color:rgba(224,232,222,.9);background:rgba(255,255,255,.94);box-shadow:0 13px 35px rgba(7,28,18,.18)}.settings-stack{display:grid;gap:18px}.settings-stack .card h2{margin-bottom:6px}.settings-note{margin:8px 0 0;color:var(--muted);font-size:14px;line-height:1.55}.toggle-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid var(--line)}.toggle-row:first-of-type{border-top:0;padding-top:8px}.toggle-row strong{display:block;font-size:15px}.toggle-row span{display:block;margin-top:4px;color:var(--muted);font-size:13px;line-height:1.45}.switch{position:relative;display:inline-flex;width:48px;height:28px;flex:0 0 auto}.switch input{opacity:0;width:0;height:0}.switch span{position:absolute;inset:0;border-radius:999px;background:#d5e1d7;transition:.18s ease}.switch span:before{content:"";position:absolute;width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(7,28,18,.2);transition:.18s ease}.switch input:checked+span{background:var(--green)}.switch input:checked+span:before{transform:translateX(20px)}.category-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.category-grid label{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fcfdfb;font-size:14px}.privacy-pill{display:inline-flex;margin-left:8px;padding:3px 8px;border-radius:999px;background:#eaf5e9;color:var(--green);font:500 10px/1 DM Mono,monospace;letter-spacing:.04em;text-transform:uppercase}.privacy-pill.private{background:#f3f0e4;color:#6f5d2d}@media(max-width:760px){.top{min-height:66px;padding-inline:20px}.brand{font-size:24px}.shell{padding:44px 20px 76px}.page-head h1{font-size:42px}.card{padding:23px;border-radius:20px}.category-grid{grid-template-columns:1fr}}`;
  document.head.append(homeTheme);

  const home=()=>location.assign('/');
  const fail=e=>{$('#pageBody').innerHTML=`<section class="notice"><strong>We could not load this page.</strong><br>${escape(e.message)}<br><br><button class="button" id="backHome">Back to home</button></section>`;$('#backHome').onclick=home};

  const mountGame=async()=>{
    const d=await api('?view=me');
    profile=d.profile||{};
    $('#pageBody').innerHTML=`<div class="grid"><section class="card dark"><div class="kicker" style="color:#d8f7a2">Your scorecard</div><h2>Play your game.</h2><p>Log a round after the course. Your stats only use rounds you add—nothing is estimated.</p><div class="action-row"><button class="button" id="logRound">Log a round</button><a class="button ghost" href="/settings">Settings</a></div></section><section class="card"><div class="kicker">Season snapshot</div><div class="stat-grid"><div class="stat"><b>${d.stats?.rounds??'-'}</b><span>Rounds</span></div><div class="stat"><b>${d.stats?.average??'-'}</b><span>18-hole avg</span></div><div class="stat"><b>${d.stats?.best??'-'}</b><span>Best score</span></div></div></section></div><section class="card history"><h2>Round history</h2>${d.rounds?.length?d.rounds.map(r=>`<div class="round"><div><strong>${escape(r.course_name)}</strong><small>${new Date(r.played_on+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · ${r.holes} holes${r.par?' · Par '+r.par:''}</small></div><div class="score">${r.score}<small>${r.visibility==='private'?'Private':escape(r.visibility)}</small></div></div>`).join(''):`<div class="empty"><h2>Your scorecard starts here.</h2><p>Log your first round to see your real scoring average and personal best.</p></div>`}</section>`;
    $('#pageTitle').textContent=profile.username||'My game';
    $('#logRound').onclick=()=>openRound();
  };

  const openRound=()=>{$('#roundDialog').hidden=false;$('#roundDate').value=new Date().toISOString().slice(0,10);$('#roundDialog').scrollIntoView({behavior:'smooth',block:'center'})};

  const mountPlayers=async()=>{
    profile=(await api('?view=me')).profile||{};
    const body=$('#pageBody');
    body.innerHTML=`<section class="card"><label for="playerSearch"><strong>Search player usernames</strong></label><input class="search" id="playerSearch" maxlength="24" placeholder="Search by username"><div class="players" id="playerResults"><p>Loading players...</p></div></section>`;
    const search=$('#playerSearch'),results=$('#playerResults');
    const load=async()=>{
      results.innerHTML='<p>Searching...</p>';
      try{
        const d=await api('?view=players&q='+encodeURIComponent(search.value.trim()));
        results.innerHTML=d.players.length?d.players.map(p=>`<div class="player"><div class="avatar">${avatar(p)}</div><div class="player-main"><strong>${escape(p.username)}</strong><small>${escape(p.city||p.home_course||'Golfolio player')}</small></div><button class="button" data-id="${p.id}" data-following="${p.following}">${p.following?'Following':'Follow'}</button></div>`).join(''):`<div class="empty"><h2>No player found.</h2><p>Try another username as more golfers join Golfolio.</p></div>`;
        results.querySelectorAll('[data-id]').forEach(b=>b.onclick=async()=>{
          b.disabled=true;
          try{await api('',{method:'POST',body:JSON.stringify({action:b.dataset.following==='true'?'unfollow':'follow',following_id:b.dataset.id})});load()}
          catch(e){b.disabled=false;alert(e.message)}
        });
      }catch(e){results.innerHTML=`<div class="notice">${escape(e.message)}</div>`}
    };
    search.oninput=()=>{clearTimeout(search.timer);search.timer=setTimeout(load,250)};
    load();
  };

  const toggleRow=(id,title,copy,checked)=>`<label class="toggle-row" for="${id}"><div><strong>${title}</strong><span>${copy}</span></div><span class="switch"><input id="${id}" type="checkbox" ${checked?'checked':''}><span></span></span></label>`;

  const mountSettings=async()=>{
    const data=await settingsApi();
    profile=data.profile||{};
    const s=data.settings||{};
    let selected=profile.avatar||'G';
    const choices=['G','P','F','B','C'];
    $('#pageBody').innerHTML=`
      <div class="settings-stack">
        <section class="card">
          <div class="kicker">Profile</div>
          <h2>Player profile</h2>
          <p class="settings-note">Your username is visible to other golfers. Your real name and phone number stay private.</p>
          <form class="form" id="profileForm">
            <label>Player username <span class="privacy-pill">Public</span></label>
            <input value="${escape(profile.username)}" disabled>
            <label for="firstName">First name (optional) <span class="privacy-pill private">Private</span></label>
            <input id="firstName" maxlength="60" value="${escape(profile.first_name)}">
            <label for="lastName">Last name (optional) <span class="privacy-pill private">Private</span></label>
            <input id="lastName" maxlength="60" value="${escape(profile.last_name)}">
            <label for="phone">Phone number (optional) <span class="privacy-pill private">Private</span></label>
            <input id="phone" type="tel" maxlength="30" value="${escape(profile.phone)}">
            <label>Choose a golf avatar</label>
            <div class="avatar-options">${choices.map(x=>`<button class="avatar-option ${x===selected?'selected':''}" type="button" data-avatar="${x}">${x}</button>`).join('')}</div>
            <button class="button" type="submit">Save profile</button>
            <p class="status" id="profileStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Email and account</div>
          <h2>Email</h2>
          <p class="settings-note">Email changes go through Supabase Auth verification. Your current email stays active until you confirm the new one.</p>
          <form class="form" id="emailForm">
            <label>Current email</label>
            <input value="${escape(data.email||'')}" disabled>
            ${data.newEmail?`<p class="notice">Pending verification for <strong>${escape(data.newEmail)}</strong>.</p>`:''}
            <label for="newEmail">New email address</label>
            <input id="newEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
            <button class="button" type="submit">Request email change</button>
            <p class="status" id="emailStatus"></p>
          </form>
          <p class="settings-note">Need a password reset? Sign out, open Sign in on Home, then use Forgot password.</p>
        </section>

        <section class="card">
          <div class="kicker">Notifications</div>
          <h2>What you want to hear about</h2>
          <p class="settings-note">These choices are saved now for Golfolio’s future notification system. Nothing is sent yet.</p>
          <form id="notifyForm">
            ${toggleRow('notifyNearby','Verified events near me','Approved tournaments, courses, and training near your launch area.',s.notify_nearby_events)}
            ${toggleRow('notifyFollowed','Saved / followed golf activity','Updates related to players and golf you choose to follow.',s.notify_followed_activity)}
            ${toggleRow('notifyProduct','Golfolio product updates','Occasional product notes about Golfolio itself.',s.notify_product_updates)}
            <div class="action-row"><button class="button" type="submit">Save notification choices</button></div>
            <p class="status" id="notifyStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Location</div>
          <h2>Nearby golf</h2>
          <p class="settings-note">Golfolio can remember that you want nearby sorting. Browser/device permission is controlled by your browser and cannot be silently changed by this website. Precise location history is never stored.</p>
          <form class="form" id="locationForm">
            ${toggleRow('useLocation','Use my location','When enabled, Home can ask the browser for location after you tap Use location.',s.use_location)}
            <label for="nearbyRadius">Nearby radius (miles)</label>
            <input id="nearbyRadius" type="number" min="1" max="100" step="1" value="${Number(s.nearby_radius_miles||15)}">
            <div class="action-row">
              <button class="button" type="submit">Save location settings</button>
              <button class="button ghost" type="button" id="requestLocation">Request browser location now</button>
            </div>
            <p class="status" id="locationStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Preferences</div>
          <h2>Listing categories on Home</h2>
          <p class="settings-note">Choose which approved listing types appear on your launch board.</p>
          <form id="prefsForm">
            <div class="category-grid">
              <label><input id="showTournaments" type="checkbox" ${s.show_tournaments?'checked':''}> <span><strong>Tournaments</strong><br><small>Events and competitions</small></span></label>
              <label><input id="showCourses" type="checkbox" ${s.show_courses?'checked':''}> <span><strong>Courses</strong><br><small>Places to play</small></span></label>
              <label><input id="showTraining" type="checkbox" ${s.show_training?'checked':''}> <span><strong>Training</strong><br><small>Lessons and clinics</small></span></label>
              <label><input id="showSimulators" type="checkbox" ${s.show_simulators?'checked':''}> <span><strong>Simulators</strong><br><small>Indoor / sim events</small></span></label>
            </div>
            <div class="action-row"><button class="button" type="submit">Save preferences</button></div>
            <p class="status" id="prefsStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Data / security</div>
          <h2>How your settings are stored</h2>
          <p class="settings-note">Settings live in your private <code>user_settings</code> row in Supabase. Row Level Security limits read/write to your own account. Service-role keys never ship to the browser.</p>
        </section>
      </div>`;

    document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{
      selected=b.dataset.avatar;
      document.querySelectorAll('[data-avatar]').forEach(x=>x.classList.toggle('selected',x===b));
    });

    $('#profileForm').onsubmit=async e=>{
      e.preventDefault();
      const status=$('#profileStatus');
      status.textContent='Saving...';
      try{
        const c=await config();
        const r=await fetch(c.supabaseUrl+'/rest/v1/profiles?id=eq.'+encodeURIComponent(profile.id),{
          method:'PATCH',
          headers:{apikey:c.supabaseAnonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:'return=representation'},
          body:JSON.stringify({
            first_name:$('#firstName').value.trim()||null,
            last_name:$('#lastName').value.trim()||null,
            phone:$('#phone').value.trim()||null,
            avatar:selected
          })
        });
        const rows=await r.json();
        if(!r.ok||!rows[0])throw Error(rows.message||'Could not save profile.');
        profile=rows[0];
        setAccountMenu(profile);
        status.textContent='Profile saved.';
      }catch(err){status.textContent=err.message}
    };

    $('#emailForm').onsubmit=async e=>{
      e.preventDefault();
      const status=$('#emailStatus');
      status.textContent='Starting email change...';
      try{
        const result=await settingsApi({
          method:'POST',
          body:JSON.stringify({
            action:'email_change',
            email:$('#newEmail').value.trim(),
            redirectTo:location.origin+'/'
          })
        });
        status.textContent=result.message||'Check your inbox to verify the new email.';
        $('#newEmail').value='';
      }catch(err){status.textContent=err.message}
    };

    const saveSettings=(statusEl,payload)=>async e=>{
      e.preventDefault();
      statusEl.textContent='Saving...';
      try{
        await settingsApi({method:'PUT',body:JSON.stringify(payload())});
        statusEl.textContent='Settings saved.';
      }catch(err){statusEl.textContent=err.message}
    };

    $('#notifyForm').onsubmit=saveSettings($('#notifyStatus'),()=>({
      notify_nearby_events:$('#notifyNearby').checked,
      notify_followed_activity:$('#notifyFollowed').checked,
      notify_product_updates:$('#notifyProduct').checked
    }));

    $('#locationForm').onsubmit=saveSettings($('#locationStatus'),()=>({
      use_location:$('#useLocation').checked,
      nearby_radius_miles:Number($('#nearbyRadius').value||15)
    }));

    $('#requestLocation').onclick=async()=>{
      const status=$('#locationStatus');
      if(!navigator.geolocation){status.textContent='This browser does not support location.';return}
      status.textContent='Waiting for browser permission...';
      navigator.geolocation.getCurrentPosition(async()=>{
        try{
          $('#useLocation').checked=true;
          await settingsApi({method:'PUT',body:JSON.stringify({use_location:true,nearby_radius_miles:Number($('#nearbyRadius').value||15)})});
          status.textContent='Browser shared location for this visit. Your preference is saved. Precise coordinates are not stored.';
        }catch(err){status.textContent=err.message}
      },()=>{status.textContent='Location was not shared. You can still save the preference and try again later.'},{enableHighAccuracy:false,timeout:10000,maximumAge:0});
    };

    $('#prefsForm').onsubmit=saveSettings($('#prefsStatus'),()=>({
      show_tournaments:$('#showTournaments').checked,
      show_courses:$('#showCourses').checked,
      show_training:$('#showTraining').checked,
      show_simulators:$('#showSimulators').checked
    }));
  };


  const mountCompany=async()=>{
    const me=await api('?view=me');
    profile=me.profile||{};
    if(profile.role!=='admin'){
      $('#pageBody').innerHTML=`<section class="card"><div class="kicker">Admin only</div><h2>This page is for Golfolio admins</h2><p class="settings-note">Company settings control launch area, moderation, and operations. Your player Settings are still available.</p><div class="action-row"><a class="button" href="/settings">Open Settings</a><a class="button ghost" href="/">Back to Home</a></div></section>`;
      return;
    }
    const data=await companyApi();
    const s=data.settings||{};
    const toggle=(id,title,copy,checked)=>`<label class="toggle-row" for="${id}"><div><strong>${title}</strong><span>${copy}</span></div><span class="switch"><input id="${id}" type="checkbox" ${checked?'checked':''}><span></span></span></label>`;
    $('#pageBody').innerHTML=`
      <div class="settings-stack">
        <section class="card">
          <div class="kicker">Launch area</div>
          <h2>DFW launch boundary</h2>
          <p class="settings-note">${escape(s.boundary_note||'')}</p>
          <form class="form" id="launchForm">
            <label for="launchName">Launch-region name</label>
            <input id="launchName" maxlength="120" required value="${escape(s.launch_boundary_name||'')}">
            <label for="launchDescription">Public launch description</label>
            <textarea id="launchDescription" maxlength="1000" rows="4">${escape(s.launch_description||'')}</textarea>
            <label for="launchRadius">Location radius default (miles)</label>
            <input id="launchRadius" type="number" min="1" max="100" step="1" value="${Number(s.location_radius_default||15)}">
            ${toggle('launchEnabled','Launch enabled','Pause only as an operations flag. The defined DFW boundary text stays the same until a future map editor exists.',!!s.launch_enabled)}
            <div class="action-row"><button class="button" type="submit">Save launch area</button></div>
            <p class="status" id="launchStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Listing & moderation</div>
          <h2>Review rules</h2>
          <p class="settings-note">AI-discovered listings never publish automatically while admin approval is required.</p>
          <form class="form" id="moderationForm">
            ${toggle('discoveryEnabled','AI discovery enabled','When off, the discovery job stays paused and returns a paused response.',!!s.discovery_enabled)}
            <div class="settings-note"><strong>Manual admin approval is required.</strong> Every discovered or community listing stays pending until an administrator approves it.</div>
            <label for="pendingMax">Maximum pending-review queue</label>
            <input id="pendingMax" type="number" min="1" max="25" step="1" value="${Number(s.pending_queue_max||25)}">
            ${toggle('communitySubs','Allow community submissions','Saved for community lead intake. Does not publish without review while approval is required.',!!s.community_submissions_enabled)}
            <div class="action-row"><button class="button" type="submit">Save moderation rules</button></div>
            <p class="status" id="moderationStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Notifications / operations</div>
          <h2>Admin notice preferences</h2>
          <p class="settings-note">Saved for notification delivery setup. Golfolio does not send these emails yet.</p>
          <form class="form" id="opsForm">
            <label for="opsEmails">Admin email(s) for operational notices</label>
            <input id="opsEmails" maxlength="400" placeholder="you@example.com, ops@example.com" value="${escape(s.ops_admin_emails||'')}">
            ${toggle('notifyEntered','Notify when a listing enters the review queue','Preference only until email delivery is connected.',!!s.notify_listing_entered_queue)}
            ${toggle('notifyMax','Notify when the queue reaches the maximum','Preference only until email delivery is connected.',!!s.notify_queue_at_max)}
            <div class="action-row"><button class="button" type="submit">Save operations preferences</button></div>
            <p class="status" id="opsStatus"></p>
          </form>
        </section>

        <section class="card">
          <div class="kicker">Company profile</div>
          <h2>Public company details</h2>
          <form class="form" id="profileCompanyForm">
            <label for="companyName">App / company display name</label>
            <input id="companyName" maxlength="80" required value="${escape(s.company_name||'Golfolio')}">
            <label for="supportEmail">Support email</label>
            <input id="supportEmail" type="email" maxlength="160" value="${escape(s.support_email||'')}">
            <label for="supportMessage">Public support / contact message</label>
            <textarea id="supportMessage" maxlength="1000" rows="3">${escape(s.support_message||'')}</textarea>
            <label for="privacyGuidelines">Privacy / community guidelines text or link</label>
            <textarea id="privacyGuidelines" maxlength="2000" rows="4">${escape(s.privacy_guidelines||'')}</textarea>
            <div class="action-row"><button class="button" type="submit">Save company profile</button></div>
            <p class="status" id="companyProfileStatus"></p>
          </form>
        </section>
      </div>`;

    const save=(statusEl,payload)=>async e=>{
      e.preventDefault();
      statusEl.textContent='Saving...';
      try{
        const result=await companyApi({method:'PUT',body:JSON.stringify(payload())});
        statusEl.textContent='Saved.';
        if(result.settings){/* keep page state fresh without full reload */}
      }catch(err){statusEl.textContent=err.message}
    };

    $('#launchForm').onsubmit=save($('#launchStatus'),()=>({
      launch_boundary_name:$('#launchName').value.trim(),
      launch_description:$('#launchDescription').value.trim(),
      location_radius_default:Number($('#launchRadius').value||15),
      launch_enabled:$('#launchEnabled').checked
    }));
    $('#moderationForm').onsubmit=save($('#moderationStatus'),()=>({
      discovery_enabled:$('#discoveryEnabled').checked,
      pending_queue_max:Number($('#pendingMax').value||25),
      community_submissions_enabled:$('#communitySubs').checked
    }));
    $('#opsForm').onsubmit=save($('#opsStatus'),()=>({
      ops_admin_emails:$('#opsEmails').value.trim(),
      notify_listing_entered_queue:$('#notifyEntered').checked,
      notify_queue_at_max:$('#notifyMax').checked
    }));
    $('#profileCompanyForm').onsubmit=save($('#companyProfileStatus'),()=>({
      company_name:$('#companyName').value.trim(),
      support_email:$('#supportEmail').value.trim(),
      support_message:$('#supportMessage').value.trim(),
      privacy_guidelines:$('#privacyGuidelines').value.trim()
    }));
  };

  const mountReview=async()=>{
    const d=await api('?view=me');
    profile=d.profile||{};
    if(profile.role!=='admin')throw Error('Admin access is required to review listings.');
    const body=$('#pageBody');
    const load=async()=>{
      body.innerHTML='<section class="card"><p>Loading pending listings...</p></section>';
      const r=await fetch('/api/admin',{headers:{Authorization:'Bearer '+session.access_token}});
      const data=await r.json();
      if(!r.ok)throw Error(data.error||'Could not load pending listings.');
      body.innerHTML=data.listings.length?`<section class="players">${data.listings.map(x=>`<article class="card"><div class="kicker">${escape(x.kind||'Listing')} · ${escape(x.city||'No city')}</div><h2 style="margin-top:8px">${escape(x.title)}</h2><p>Source: ${escape(x.source_name||'Not provided')}</p>${/^https?:\/\//i.test(x.source_url||'')?`<p><a href="${escape(x.source_url)}" target="_blank" rel="noreferrer">Open source</a></p>`:''}<div class="action-row"><button class="button" data-id="${escape(x.id)}" data-action="approve">Approve</button><button class="button ghost" data-id="${escape(x.id)}" data-action="reject">Reject</button></div></article>`).join('')}</section>`:'<section class="card empty"><h2>Nothing is waiting for review.</h2><p>Discovery is currently paused, so the queue will stay quiet until you choose to resume it.</p></section>';
      body.querySelectorAll('[data-id]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        const resp=await fetch('/api/admin',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id:button.dataset.id,action:button.dataset.action})});
        if(!resp.ok){const e=await resp.json();alert(e.error||'Review update failed.');button.disabled=false;return}
        load();
      });
    };
    await load();
  };

  const enhanceGame=async()=>{
    const d=await api('?view=me'),snapshot=document.querySelector('.grid .card:not(.dark)'),history=document.querySelector('.history');
    if(!snapshot||!history)return;
    const drawStats=key=>{
      const s=d.stats?.[key]||{rounds:0,average:null,best:null},label=key==='nine'?'9-hole':'18-hole';
      snapshot.innerHTML=`<div class="kicker">Season snapshot</div><div class="hole-switch" role="group" aria-label="Scorecard length"><button class="${key==='eighteen'?'active':''}" data-hole="eighteen">18 holes</button><button class="${key==='nine'?'active':''}" data-hole="nine">9 holes</button></div><div class="stat-grid"><div class="stat"><b>${s.rounds??0}</b><span>${label} rounds</span></div><div class="stat"><b>${s.average??'-'}</b><span>${label} average</span></div><div class="stat"><b>${s.best??'-'}</b><span>${label} best score</span></div></div><p class="round-totals"><strong>${d.stats?.all?.rounds??0}</strong> total rounds · <strong>${d.stats?.nine?.rounds??0}</strong> nine-hole · <strong>${d.stats?.eighteen?.rounds??0}</strong> eighteen-hole</p>`;
      snapshot.querySelectorAll('[data-hole]').forEach(button=>button.onclick=()=>drawStats(button.dataset.hole));
    };
    drawStats('eighteen');
    history.innerHTML=`<h2>Round history</h2>${d.rounds?.length?d.rounds.map(r=>`<div class="round"><div><strong>${escape(r.course_name)}</strong><small>${new Date(r.played_on+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · ${r.holes} holes${r.par?' · Par '+r.par:''}</small>${r.notes?`<p class="round-note">${escape(r.notes)}</p>`:''}</div><div class="score">${r.score}<small>${r.visibility==='private'?'Private':escape(r.visibility)}</small></div></div>`).join(''):`<div class="empty"><h2>Your scorecard starts here.</h2><p>Log your first round to see your real scoring average and personal best.</p></div>`}`;
  };

  const gameStyle=document.createElement('style');
  gameStyle.textContent='.hole-switch{display:flex;gap:6px;margin:16px 0 4px;padding:4px;border-radius:999px;background:#eff4ef}.hole-switch button{flex:1;border:0;border-radius:999px;background:transparent;color:#65776d;padding:8px 10px;font-weight:800}.hole-switch button.active{background:#fff;color:#102c22;box-shadow:0 2px 8px rgba(15,48,35,.1)}.round-totals{margin:16px 0 0!important;padding-top:13px;border-top:1px solid #e2e8df;font-size:12px!important}.round-note{max-width:500px;margin:8px 0 0!important;padding:9px 11px;border-radius:10px;background:#f2f7f1;color:#315643!important;font-size:13px!important}';
  document.head.append(gameStyle);

  const roundClose=$('#roundClose'),roundForm=$('#roundForm');
  if(roundClose)roundClose.onclick=()=>$('#roundDialog').hidden=true;
  if(roundForm)roundForm.onsubmit=async e=>{
    e.preventDefault();
    const s=$('#roundStatus');
    s.textContent='Saving round...';
    try{
      await api('',{method:'POST',body:JSON.stringify({action:'round',round:{course_name:$('#roundCourse').value,played_on:$('#roundDate').value,score:$('#roundScore').value,holes:$('#roundHoles').value,par:$('#roundPar').value,putts:$('#roundPutts').value,notes:$('#roundNotes').value,visibility:$('#roundVisibility').value}})});
      s.textContent='Round saved.';
      setTimeout(()=>location.reload(),450);
    }catch(err){s.textContent=err.message}
  };

  const routes={game:mountGame,players:mountPlayers,settings:mountSettings,company:mountCompany,account:async()=>location.replace('/settings'),review:mountReview};
  (routes[page]||home)().then(()=>{
    setAccountMenu(profile);
    if(page==='game')enhanceGame().catch(()=>{});
  }).catch(fail);
})();
