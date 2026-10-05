(() => {
  for(const form of document.querySelectorAll('[data-contact]')) {
    form.addEventListener('input',()=>{delete form.dataset.requestId;delete form.dataset.submittedAt;});
    form.addEventListener('submit',async event=>{
    event.preventDefault(); if(!form.reportValidity())return;
    const status=form.querySelector('[data-contact-status]'),button=form.querySelector('button[type="submit"]'),data=new FormData(form);
    status.textContent='Sending your message…'; button.disabled=true;
    form.dataset.requestId ||= crypto.randomUUID();
    const attributionConsent=data.get('attribution_consent')==='on';
    const gpc=navigator.globalPrivacyControl===true,dnt=navigator.doNotTrack==='1';
    const utm={};
    let referrer='';
    if(attributionConsent&&!gpc&&!dnt)try{referrer=new URL(document.referrer).origin;}catch{/* No referrer is valid. */}
    if(attributionConsent&&!gpc&&!dnt) for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
      const value=new URLSearchParams(location.search).get(key); if(value)utm[key]=value;
    }
    const payload={email:data.get('email'),name:data.get('name'),message:data.get('message'),interest:data.get('interest'),website:data.get('website'),consent:data.get('consent')==='on',
      attribution_consent:attributionConsent,link_account:data.get('link_account')==='on',gpc,dnt,utm,referrer,page_path:location.pathname,
      request_id:form.dataset.requestId,submitted_at:form.dataset.submittedAt ||= new Date().toISOString()};
    try {
      const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error('unavailable');
      status.textContent='Thank you. Your message is safely recorded for the RAGBAZ studio. We look forward to hearing what matters to you.';
      form.reset(); delete form.dataset.requestId; delete form.dataset.submittedAt;
    }catch{status.textContent='We could not record your message just now. Please try again or email ragbaz@proton.me.';}
    finally{button.disabled=false;}
    });
  }
})();
