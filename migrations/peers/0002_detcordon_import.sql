-- Only active legacy interests, retaining their original expiry and purpose.
-- No new notification or account-link consent is inferred.
INSERT OR IGNORE INTO ragbaz_peers(id,email_normalized,first_seen_at,last_seen_at,expires_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',(random()&3)+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       lower(trim(email)), strftime('%Y-%m-%dT%H:%M:%fZ',min(created_at),'unixepoch'),
       strftime('%Y-%m-%dT%H:%M:%fZ',max(created_at),'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ',max(expires_at),'unixepoch')
FROM leads WHERE expires_at > unixepoch() GROUP BY lower(trim(email));
INSERT OR IGNORE INTO ragbaz_interests(id,peer_id,payload_hash,project,source_domain,source_page,source_page_basis,name_claim,organization_claim,source_cta,message,interest_type,received_at,client_submitted_at,contact_consent,attribution_consent,account_link_requested,privacy_signal,attribution_json,expires_at)
SELECT 'legacy-detcordon:'||l.id,p.id,'legacy:'||l.id,'detcordon','detcordon.ragbaz.cc','/','legacy-lead-record',NULL,
       l.organization,l.cta,COALESCE(l.context,''),'pilot-legacy',strftime('%Y-%m-%dT%H:%M:%fZ',l.created_at,'unixepoch'),NULL,1,0,0,'unknown','[]',strftime('%Y-%m-%dT%H:%M:%fZ',l.expires_at,'unixepoch')
FROM leads l JOIN ragbaz_peers p ON p.email_normalized=lower(trim(l.email)) WHERE l.expires_at > unixepoch();
