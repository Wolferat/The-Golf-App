/* Admin photo review. All writes still require server-side admin verification. */
window.golfolioPhotoReview=async function(host,listing,session){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reasons={unsafe_url:'Not a supported public website URL.',unsupported_image:'This file is not a supported photo.',too_large:'This image exceeds the import size limit.',storage_not_private:'Private photo storage needs to be configured.',http:'The source website returned an error.',timeout:'The source website timed out.',source_not_official:'Source page is not on the saved official website.',blocked_host:'This image provider is not supported.',not_referenced_on_official_page:'The image was not found in the official page HTML. A JavaScript gallery may need a different source page.',verification_failed:'The official page could not be checked. Try another official page.',already_pending:'Already waiting for review.',already_approved:'Already approved.',already_rejected:'Previously rejected. Remove that candidate before submitting it again.',review_queue_full:'The photo review queue is full.'};
 const request=async(body)=>{
  const response=await fetch('/api/venue-photos',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({listing_id:listing.id,...body})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Photo request failed.');return result;
 };
 let note=sessionStorage.getItem('golfolio_photo_review_notice_'+listing.id)||'';
 sessionStorage.removeItem('golfolio_photo_review_notice_'+listing.id);
 const report=result=>`${(result.saved||result.photos||[]).length} photos queued for review. ${(result.omitted||[]).map(p=>`${p.url||'Image'}: ${reasons[p.reason]||p.reason}`).join(' ')}`;
 const load=async()=>{
  const response=await fetch('/api/venue-photos?view=pending&listing_id='+encodeURIComponent(listing.id),{headers:{Authorization:'Bearer '+session.access_token}});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not load photo review.');
  const photos=result.photos||[];
  host.innerHTML=`<div class="kicker">Approval checklist</div><h2>Review listing photos</h2><p>Choose up to three approved photos in total. Approved photos appear in the listing gallery; the oldest approved photo is the cover. Unselected candidates stay private.</p><p class="settings-note">Save any changes to the listing details first. You can also publish without photos.</p><div class="approval-photo-grid">${photos.map(p=>`<article class="approval-photo"><img src="${esc(p.image_url)}" alt="Photo candidate for ${esc(listing.title)}" loading="lazy" referrerpolicy="no-referrer"><p>${esc(p.status)}${p.imported?' · Imported copy':''} · <a href="${esc(p.source_url)}" target="_blank" rel="noreferrer">${esc(p.source_name||'Official website')}</a></p>${p.status==='pending'?`<label class="check"><input type="checkbox" data-photo-selection value="${esc(p.id)}"> Select for approval</label>`:''}<button type="button" class="button ghost" data-remove-photo="${esc(p.id)}">${p.status==='approved'?'Remove published photo':'Remove candidate'}</button></article>`).join('')||'<p>No photo candidates yet. Find photos or add a source image below.</p>'}</div><p class="settings-note photo-selection-summary" role="status"></p><div class="action-row"><button type="button" class="button" id="approvePhotos">${listing.status==='approved'?'Approve selected photos':'Approve listing with selected photos'}</button><button type="button" class="button ghost" id="reviewFindPhotos">Find photos on official website</button>${listing.photos?.length?'<button type="button" class="button ghost" id="importLegacyPhotos">Review previously researched photos</button>':''}</div><form class="form photo-source-form"><h3>Add a photo from the official website</h3><label>Image URL<input name="image" type="url" placeholder="https://…/photo.jpg" required></label><label>Official page showing this image<input name="source" type="url" value="${esc(listing.official_website||'')}" required></label><button class="button ghost" type="submit">Add for review</button></form><p class="status photo-review-status" role="status">${esc(note)}</p>`;
  const approve=host.querySelector('#approvePhotos');
  const selected=()=>[...host.querySelectorAll('[data-photo-selection]:checked')].map(input=>input.value);
  const existing=photos.filter(photo=>photo.status==='approved').length;
  const updateSelection=()=>{
   const count=selected().length;
   host.querySelector('.photo-selection-summary').textContent=`${count} selected · ${existing} already approved · Maximum 3 total`;
   approve.disabled=count+existing>3||(listing.status==='approved'&&count===0);
   if(listing.status!=='approved')approve.textContent=count?'Approve listing with selected photos':'Approve listing without additional photos';
  };
  host.querySelectorAll('[data-photo-selection]').forEach(input=>input.onchange=updateSelection);
  updateSelection();
  host.querySelectorAll('img').forEach(img=>{
   const failed=()=>{
    if(img.hidden)return;
    img.hidden=true;const input=img.closest('article').querySelector('[data-photo-selection]');
    if(input){input.checked=false;input.disabled=true;}
    const warning=document.createElement('p');warning.textContent='Image could not load. Add a working image URL before approving.';img.after(warning);updateSelection();
   };
   img.onerror=failed;if(img.complete&&!img.naturalWidth)failed();
  });
  let busy=false;
  const run=async(button,fn)=>{
   if(busy)return;busy=true;
   const controls=[...host.querySelectorAll('button,input')].map(el=>({el,disabled:el.disabled}));
   controls.forEach(({el})=>el.disabled=true);
   const status=host.querySelector('.photo-review-status');status.textContent='Working…';
   try{await fn();}catch(error){status.textContent=error.message;}
   finally{busy=false;controls.forEach(({el,disabled})=>{if(el.isConnected)el.disabled=disabled;});}
  };
  approve.onclick=()=>run(approve,async()=>{
   if(document.querySelector('#editForm')?.dataset.dirty==='true')throw Error('Save your listing details before approving photos or publishing.');
   const photo_ids=selected();
   if(listing.status==='approved'){await request({action:'approve_selection',photo_ids});note='Selected photos approved and available in the app.';await load();}
   else{
    const response=await fetch('/api/admin',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id:listing.id,action:'approve',photo_reviewed:true,photo_ids})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Approval failed.');window.golfolioNavigate('/listings');
   }
  });
  const find=host.querySelector('#reviewFindPhotos');find.onclick=()=>run(find,async()=>{note=report(await request({action:'find'}));await load();});
  const legacy=host.querySelector('#importLegacyPhotos');if(legacy)legacy.onclick=()=>run(legacy,async()=>{note=report(await request({action:'stage',photos:listing.photos}));await load();});
  const form=host.querySelector('form');form.onsubmit=event=>{event.preventDefault();run(form.querySelector('button'),async()=>{note=report(await request({action:'stage',photos:[{url:form.elements.image.value,source_url:form.elements.source.value,source_name:'Official website'}]}));await load();});};
  host.querySelectorAll('[data-remove-photo]').forEach(button=>button.onclick=()=>run(button,async()=>{await request({action:'remove',photo_id:button.dataset.removePhoto});note='Photo removed.';await load();}));
 };
 host.refresh=load;
 try{await load();}catch(error){host.textContent=error.message;}
};
