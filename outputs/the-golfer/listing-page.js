(()=>{
  const $=s=>document.querySelector(s);
  const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const id=new URLSearchParams(location.search).get('id');
  const root=$('#listingDetail');
  const stars=n=>{
    const rating=Math.max(0,Math.min(5,Number(n)||0));
    return `<span class="stars" aria-label="${rating} out of 5">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>`;
  };
  const when=iso=>{
    if(!iso)return null;
    return new Date(iso).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };
  const fail=message=>{
    document.title='Listing unavailable · Golfolio';
    root.innerHTML=`<section class="card empty"><div class="kicker">Not available</div><h2>This listing is not available.</h2><p>${escape(message)}</p><p class="settings-note">Pending, rejected, archived, expired, and deleted listings are not public.</p><div class="action-row"><a class="button" href="/">Back to Home</a></div></section>`;
  };
  let session=null;
  try{session=JSON.parse(localStorage.getItem('golfolio_session')||'null')}catch{}
  const authHeaders=()=>({
    'Content-Type':'application/json',
    ...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{})
  });
  const readPhoto=file=>new Promise((resolve,reject)=>{
    if(!file)return resolve(null);
    if(file.size>2*1024*1024)return reject(Error('Review photos must be 2 MB or smaller.'));
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type))return reject(Error('Review photos must be JPEG, PNG, or WebP.'));
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(Error('Could not read that photo.'));
    reader.readAsDataURL(file);
  });

  if(!id){fail('No listing was requested.');return}

  const signInHref='/?login=1&returnTo='+encodeURIComponent(location.pathname+location.search);
  const signupHref='/?signup=1&returnTo='+encodeURIComponent(location.pathname+location.search);
  const showGate=()=>{
    document.title='Sign in · Golfolio';
    root.innerHTML=`<section class="card">
      <div class="kicker">Golfolio</div>
      <h2>Sign in to explore verified golf near you.</h2>
      <p>Create a free player account to unlock the board.</p>
      <div class="action-row">
        <a class="button" href="${escape(signInHref)}">Sign in</a>
        <a class="button ghost" href="${escape(signupHref)}">Create a free player account</a>
      </div>
    </section>`;
  };
  const accountLink=$('#listingAccount');
  if(accountLink){
    if(session?.access_token){
      accountLink.textContent='My game';
      accountLink.href='/hub';
    }else{
      accountLink.textContent='Sign in';
      accountLink.href=signInHref;
    }
  }
  if(!session?.access_token){showGate();return}

  const reviewCard=(rv,canEdit)=>{
    const pending=rv.status&&rv.status!=='approved';
    const photoNote=rv.photo_status==='pending'?'Photo waiting for admin approval.':rv.photo_status==='rejected'?'Photo was not approved.':'';
    return `<article class="review-card">
      <div class="review-head">
        <div class="avatar">${escape(rv.avatar||'G')}</div>
        <div>
          <strong>${escape(rv.username||'Golfolio player')}</strong>
          <div class="rating-line">${stars(rv.rating)}${rv.visited_on?` · visited ${escape(rv.visited_on)}`:''}</div>
        </div>
      </div>
      ${rv.title?`<h3>${escape(rv.title)}</h3>`:''}
      <p>${escape(rv.body)}</p>
      ${rv.photo_url?`<img class="review-photo" src="${escape(rv.photo_url)}" alt="Review photo from ${escape(rv.username||'player')}">`:''}
      ${pending||photoNote?`<p class="settings-note">${pending?'Your review is waiting for admin approval. It is not public yet. ':''}${escape(photoNote)}</p>`:''}
      ${canEdit&&rv.mine?`<div class="action-row"><button class="button ghost" type="button" data-edit-review="${escape(rv.id)}">Edit</button><button class="button ghost" type="button" data-delete-review="${escape(rv.id)}">Delete</button></div>`:''}
    </article>`;
  };

  (async()=>{
    const listingRes=await fetch('/api/listing?id='+encodeURIComponent(id),{headers:authHeaders()});
    const listingData=await listingRes.json().catch(()=>({}));
    if(listingRes.status===401||listingData.gate){showGate();return}
    if(!listingRes.ok||!listingData.listing)throw Error(listingData.error||'That listing is not available.');
    const listing=listingData.listing;
    const rating=listingData.rating||{average:null,count:0};
    const official=(listingData.official_photos||[]).slice(0,3);
    const reviewable=!!listingData.reviewable;
    const roundable=!!listingData.roundable;
    const website=listing.official_website;
    const registration=listing.registration_url&&listing.registration_url!==website?listing.registration_url:null;

    let profile=null;
    if(session?.access_token){
      const me=await fetch('/api/player?view=me',{headers:authHeaders()}).then(r=>r.ok?r.json():null).catch(()=>null);
      profile=me?.profile||null;
    }
    const isAdmin=profile?.role==='admin';

    const reviewsRes=await fetch('/api/reviews?listing_id='+encodeURIComponent(id),{headers:authHeaders()});
    const reviewsData=reviewsRes.ok?await reviewsRes.json().catch(()=>({})):{};
    const publicReviews=(reviewsData.reviews||[]).filter(rv=>rv.status==='approved'||rv.mine);
    const mine=reviewsData.mine||publicReviews.find(rv=>rv.mine)||null;

    let venueStats=null;
    if(session?.access_token&&roundable){
      const statsRes=await fetch('/api/player?view=venue&listing_id='+encodeURIComponent(id),{headers:authHeaders()});
      venueStats=statsRes.ok?await statsRes.json().catch(()=>null):null;
    }

    document.title=`${listing.title} · Golfolio`;
    const ratingLabel=rating.count
      ? `${rating.average} average · ${rating.count} review${rating.count===1?'':'s'}`
      : 'No public reviews yet';

    const verifiedBadge=`<span class="verified-badge detail-verified" aria-label="Verified listing"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#178357"/><path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span class="verified-text">Verified</span></span>`;

    root.innerHTML=`<div class="page-head"><div><div class="kicker">${escape(listing.kind||'Listing')}</div><h1>${escape(listing.title)}</h1>${verifiedBadge}<p>${escape(listing.venue_name||listing.city||'Sherman area')}</p><p class="rating-line">${rating.count?stars(Math.round(rating.average)):''} ${escape(ratingLabel)}</p></div></div>
      <section class="card">
        ${listing.description?`<p>${escape(listing.description)}</p>`:'<p class="settings-note">A public description has not been verified yet.</p>'}
        <div class="detail-grid">
          <div><strong>Course / venue</strong><p>${escape(listing.venue_name||'Not verified')}</p></div>
          <div><strong>City</strong><p>${escape(listing.city||'Sherman area')}</p></div>
          <div><strong>Address</strong><p>${escape(listing.address||'Not verified')}</p></div>
          <div><strong>When</strong><p>${escape([when(listing.starts_at),when(listing.ends_at)].filter(Boolean).join(' – ')||'Date not verified')}</p></div>
          <div><strong>Fees</strong><p>${escape(listing.price_note||'See the official website or registration page for pricing.')}</p></div>
          <div><strong>Phone</strong><p>${listing.phone?`<a href="tel:${escape(listing.phone.replace(/[^\d+]/g,''))}">${escape(listing.phone)}</a>`:'Not verified'}</p></div>
        </div>
        <div class="action-row">
          ${website?`<a class="button" href="${escape(website)}" target="_blank" rel="noreferrer">Official website</a>`:''}
          ${registration?`<a class="button ghost" href="${escape(registration)}" target="_blank" rel="noreferrer">Official registration</a>`:''}
        </div>
        <p class="settings-note">Confirm details with the organizer or venue. Official website and registration links remain the authority.</p>
      </section>
      <section class="card" style="margin-top:18px">
        <div class="kicker">Official venue photos</div>
        <h2>From the official venue website</h2>
        ${official.length?`<div class="photo-grid">${official.map(p=>`<figure><img src="${escape(p.image_url)}" alt="${escape(listing.title)}" referrerpolicy="no-referrer"><figcaption>From the official venue website${p.source_url?` · <a href="${escape(p.source_url)}" target="_blank" rel="noreferrer">${escape(p.source_name||'Official site')}</a>`:''}</figcaption></figure>`).join('')}</div>`:'<p class="settings-note">No official venue photos have been approved yet. Player review photos stay attached to reviews, not this gallery.</p>'}
        ${isAdmin&&reviewable?`<div class="action-row"><button class="button ghost" type="button" id="findOfficialPhotos">Find official venue photos</button></div><p class="status" id="officialPhotoStatus"></p>`:''}
      </section>
      ${roundable?`<section class="card" style="margin-top:18px">
        <div class="kicker">My rounds here</div>
        <h2>Your stats at this venue</h2>
        ${session?.access_token?`<div class="stat-grid"><div class="stat"><b>${venueStats?.stats?.rounds??0}</b><span>Rounds played</span></div><div class="stat"><b>${venueStats?.stats?.nine_average??'-'}</b><span>9-hole avg</span></div><div class="stat"><b>${venueStats?.stats?.eighteen_average??'-'}</b><span>18-hole avg</span></div></div>
          ${venueStats?.recent?.length?venueStats.recent.map(r=>`<div class="round"><div><strong>${escape(r.course_name)}</strong><small>${new Date(r.played_on+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · ${r.holes} holes</small></div><div class="score">${r.score}</div></div>`).join(''):'<p class="settings-note">You have not logged a round at this venue yet.</p>'}
          <p class="settings-note">Only you can see these rounds. Other players’ history is never shown.</p>`:`<p class="settings-note">Sign in to see your own rounds at this venue.</p><div class="action-row"><a class="button" href="${escape(signInHref)}">Sign in</a></div>`}
      </section>`:''}
      <section class="card" style="margin-top:18px">
        <div class="kicker">Player reviews</div>
        <h2>Golfolio reviews</h2>
        ${reviewable?'':'<p class="settings-note">Reviews are only for approved courses and simulators. Tournament, charity, corporate, training, and expired listings cannot be reviewed.</p>'}
        ${reviewable&&!session?.access_token?`<p class="settings-note">Sign in to leave one review. You can attach one photo to the review. Reviews stay pending until an admin approves them.</p><div class="action-row"><a class="button" href="${escape(signInHref)}">Sign in to review</a></div>`:''}
        ${reviewable&&session?.access_token?`<form class="form" id="reviewForm">
          <p class="settings-note">${mine?'You already reviewed this venue. Editing sends it back to admin approval.':'One review per player. It stays private until an admin approves it. Optional: attach one photo to this review only.'}</p>
          <input type="hidden" id="reviewId" value="${escape(mine?.id||'')}">
          <label for="reviewRating">Rating</label>
          <select id="reviewRating">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(mine?.rating)===n||(!mine&&n===5)?'selected':''}>${n} star${n===1?'':'s'}</option>`).join('')}</select>
          <label for="reviewTitle">Title (optional)</label>
          <input id="reviewTitle" maxlength="80" value="${escape(mine?.title||'')}">
          <label for="reviewBody">Review</label>
          <textarea id="reviewBody" maxlength="2000" required>${escape(mine?.body||'')}</textarea>
          <label for="reviewVisit">Visit date (optional)</label>
          <input id="reviewVisit" type="date" value="${escape(mine?.visited_on||'')}">
          <label for="reviewPhoto">One photo (optional, JPEG/PNG/WebP, 2 MB max)</label>
          <input id="reviewPhoto" type="file" accept="image/jpeg,image/png,image/webp">
          <div class="action-row"><button class="button" type="submit">${mine?'Update review':'Submit review'}</button>${mine?`<button class="button ghost" type="button" id="deleteReview">Delete my review</button>`:''}</div>
          <p class="status" id="reviewStatus"></p>
        </form>`:''}
        <div id="reviewList" style="margin-top:18px">${publicReviews.filter(rv=>rv.status==='approved').length?publicReviews.filter(rv=>rv.status==='approved').map(rv=>reviewCard(rv,false)).join(''):'<p class="settings-note">No approved player reviews yet.</p>'}</div>
        ${mine&&mine.status!=='approved'?`<div style="margin-top:18px"><div class="kicker">Your review</div>${reviewCard(mine,true)}</div>`:''}
      </section>`;

    const postReview=async(body)=>{
      const r=await fetch('/api/reviews',{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(d.error||'Could not save that review.');
      return d;
    };

    const form=$('#reviewForm');
    if(form){
      form.onsubmit=async e=>{
        e.preventDefault();
        const s=$('#reviewStatus');
        s.textContent='Saving review...';
        try{
          const photo=await readPhoto($('#reviewPhoto').files[0]);
          const payload={
            listing_id:id,
            id:$('#reviewId').value||undefined,
            action:$('#reviewId').value?'update':'create',
            rating:Number($('#reviewRating').value),
            title:$('#reviewTitle').value.trim(),
            body:$('#reviewBody').value.trim(),
            visited_on:$('#reviewVisit').value||null,
            photo
          };
          const d=await postReview(payload);
          s.textContent=d.message||'Review submitted for admin approval.';
          setTimeout(()=>location.reload(),700);
        }catch(err){s.textContent=err.message}
      };
    }
    const deleteBtn=$('#deleteReview');
    if(deleteBtn&&mine?.id){
      deleteBtn.onclick=async()=>{
        if(!confirm('Delete your review? You can write a new one later.'))return;
        try{
          await postReview({action:'delete',id:mine.id});
          location.reload();
        }catch(err){alert(err.message)}
      };
    }
    root.querySelectorAll('[data-delete-review]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Delete your review? You can write a new one later.'))return;
      try{
        await postReview({action:'delete',id:button.dataset.deleteReview});
        location.reload();
      }catch(err){alert(err.message)}
    });
    root.querySelectorAll('[data-edit-review]').forEach(button=>button.onclick=()=>{
      $('#reviewForm')?.scrollIntoView({behavior:'smooth',block:'center'});
    });

    const findBtn=$('#findOfficialPhotos');
    if(findBtn){
      findBtn.onclick=async()=>{
        const s=$('#officialPhotoStatus');
        findBtn.disabled=true;
        s.textContent='Searching the official venue website...';
        try{
          const r=await fetch('/api/venue-photos',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'find',listing_id:id})});
          const d=await r.json().catch(()=>({}));
          if(!r.ok)throw Error(d.error||'Could not find official photos.');
          s.textContent=d.message||'Saved as pending. Nothing was published.';
        }catch(err){s.textContent=err.message;findBtn.disabled=false}
      };
    }
  })().catch(err=>fail(err.message));
})();
