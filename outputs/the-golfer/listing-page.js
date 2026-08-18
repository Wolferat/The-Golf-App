(()=>{
  const $=s=>document.querySelector(s);
  const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const id=new URLSearchParams(location.search).get('id');
  const root=$('#listingDetail');
  const when=iso=>{
    if(!iso)return null;
    return new Date(iso).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };
  const fail=message=>{
    document.title='Listing unavailable · Golfolio';
    root.innerHTML=`<section class="card empty"><div class="kicker">Not available</div><h2>This listing is not available.</h2><p>${escape(message)}</p><p class="settings-note">Pending, rejected, archived, expired, and deleted listings are not public.</p><div class="action-row"><a class="button" href="/">Back to Home</a></div></section>`;
  };
  if(!id){fail('No listing was requested.');return}
  fetch('/api/listing?id='+encodeURIComponent(id)).then(async r=>{
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.listing)throw Error(data.error||'That listing is not available.');
    return data.listing;
  }).then(listing=>{
    document.title=`${listing.title} · Golfolio`;
    const site=listing.registration_url||listing.official_website||listing.source_url;
    const photos=(listing.photos||[]).filter(x=>x?.url).slice(0,3);
    const reviews=(listing.reviews||[]).filter(x=>x?.excerpt&&x?.source_url).slice(0,3);
    root.innerHTML=`<div class="page-head"><div><div class="kicker">${escape(listing.kind||'Listing')}</div><h1>${escape(listing.title)}</h1><p>${escape(listing.venue_name||listing.city||'Sherman area')}</p></div></div>
      <section class="card">
        ${listing.description?`<p>${escape(listing.description)}</p>`:'<p class="settings-note">A public description has not been verified yet.</p>'}
        <div class="detail-grid">
          <div><strong>Course / venue</strong><p>${escape(listing.venue_name||'Not verified')}</p></div>
          <div><strong>City</strong><p>${escape(listing.city||'Sherman area')}</p></div>
          <div><strong>Address</strong><p>${escape(listing.address||'Not verified')}</p></div>
          <div><strong>When</strong><p>${escape([when(listing.starts_at),when(listing.ends_at)].filter(Boolean).join(' – ')||'Date not verified')}</p></div>
          <div><strong>Fees</strong><p>${escape(listing.price_note||'See the official source for pricing.')}</p></div>
          <div><strong>Phone</strong><p>${listing.phone?`<a href="tel:${escape(listing.phone.replace(/[^\d+]/g,''))}">${escape(listing.phone)}</a>`:'Not verified'}</p></div>
        </div>
        <div class="action-row">
          ${site?`<a class="button" href="${escape(site)}" target="_blank" rel="noreferrer">Official website / registration</a>`:''}
          ${listing.source_url?`<a class="button ghost" href="${escape(listing.source_url)}" target="_blank" rel="noreferrer">Source: ${escape(listing.source_name||'Official listing')}</a>`:''}
        </div>
        <p class="settings-note">Information is source-backed and may change. Confirm details with the organizer or venue.</p>
      </section>
      <section class="card" style="margin-top:18px">
        <div class="kicker">Photos</div>
        <h2>Verified photos</h2>
        ${photos.length?`<div class="photo-grid">${photos.map(p=>`<figure><img src="${escape(p.url)}" alt="${escape(listing.title)}"><figcaption>Source: ${p.source_url?`<a href="${escape(p.source_url)}" target="_blank" rel="noreferrer">${escape(p.source_name||'Source')}</a>`:escape(p.source_name||'')}</figcaption></figure>`).join('')}</div>`:'<p class="settings-note">No verified photos have been added yet.</p>'}
      </section>
      <section class="card" style="margin-top:18px">
        <div class="kicker">Reviews</div>
        <h2>Source-backed excerpts</h2>
        ${reviews.length?reviews.map(rv=>`<blockquote class="review-excerpt"><p>“${escape(rv.excerpt)}”</p><cite><a href="${escape(rv.source_url)}" target="_blank" rel="noreferrer">${escape(rv.source_name||'Source')}</a></cite></blockquote>`).join(''):'<p class="settings-note">Course review information has not been verified yet.</p>'}
      </section>`;
  }).catch(err=>fail(err.message));
})();
