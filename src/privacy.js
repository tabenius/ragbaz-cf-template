export function privacyPage(site) {
  return { id:'privacy',path:'/privacy/',kind:'page',title:'Privacy, contact and attribution',description:'How the RAGBAZ studio records interest without advertising trackers or fingerprinting.',status:'published',created:site.updated,published:site.updated,updated:site.updated,tags:[],sections:[
    {id:'messages',title:'A conversation needs a record—not a surveillance profile.',paragraphs:[
      'When you contact us, we keep the message, email, optional name, project, page and server receipt time. A shared studio contact UUID lets repeated requests using the same normalized email belong to one contact record. That email match is a correlation, not proof that one person authored every message.',
      'Your name is recorded as your own statement. We do not infer a legal identity from a browser, referrer or email address. Contact records are private to the studio; the public form never returns the shared contact UUID or exposes whether an email has contacted us before.'
    ]},
    {id:'attribution',title:'How you found us is optional and qualified.',paragraphs:[
      'If you opt in, we record the available campaign tags and the origin of the browser-declared referrer. Google in a referrer is only a candidate explanation, not proof of a search or of your intentions. We exclude referrer query strings and do not keep search queries, advertising identifiers or full browsing histories.',
      'Global Privacy Control and Do Not Track suppress optional attribution, even when the box is checked. We use no advertising pixels, fingerprinting, hidden cross-site identifier or analytics cookie. A short-lived server-side HMAC bucket supports spam protection without storing raw IP addresses in peer records.'
    ]},
    {id:'accounts',title:'Account connections need a separate kind of evidence.',paragraphs:[
      'If you request an account connection, the studio can record a candidate match to a RAGBAZ account with a verified email. This does not prove that the account owner wrote an earlier unverified message and does not grant account access or change permissions.',
      'The current account source does not contain a real-name field. A name given in a contact form remains a name claim. If a supported account-name field is added later, it can be retained with its source and observation dates as an account-declared name—not proof of legal identity. We do not guess missing details.'
    ]},
    {id:'retention',title:'Dates, purpose and your wishes matter.',paragraphs:[
      'Messages and attribution observations expire after 180 days. The minimal studio contact record expires after 365 days without a new request; abuse buckets expire after two days. Imported active DetCordon interests keep their original purpose and expiry, without new notification or account-link consent.',
      'For questions, access, correction or deletion requests, contact ragbaz@proton.me and tell us the email used. We may ask you to demonstrate control of the address before changing someone’s record. A contact request does not subscribe you to a mailing list or create an account.'
    ]}
  ]};
}
