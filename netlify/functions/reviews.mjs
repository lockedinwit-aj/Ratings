
async function verifyTurnstile(token, request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret || !token) {
    return false;
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",

const valid = await verifyTurnstile(
  input.turnstileToken,
  request
);

if (!valid) {
  return respond(403, {
    error: "Security Check Failed. Please Try Again."
  });
}
      {
        method: "POST",
        body: formData
      }
    );

    if (!response.ok) return false;

    const result = await response.json();

    return result.success === true &&
      result.hostname === "woodworkwithaj.netlify.app";
  } catch (error) {
    console.error("Turnstile Verification Failed", error);
    return false;
  }
}
import { getStore } from '@netlify/blobs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const respond=(status,obj)=>new Response(JSON.stringify(obj),{status,headers});
export default async (request)=>{
  try {
    const store=getStore('customer-reviews');
    if(request.method==='GET'){
      const {blobs}=await store.list({paginate:false});
      const entries=await Promise.all(blobs.slice(0,250).map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));
      const reviews=entries.filter(r=>r&&r.name&&r.message&&Number.isInteger(r.rating)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
      return respond(200,{reviews});
    }
    if(request.method!=='POST')return respond(405,{error:'Method Not Allowed'});
    if(Number(request.headers.get('content-length')||0)>5000)return respond(413,{error:'Review Is Too Long.'});
    const input=await request.json();
    if(input.website)return respond(200,{ok:true});
    const name=String(input.name||'').trim(),message=String(input.message||'').trim(),rating=Number(input.rating);
    if(!name||name.length>60||message.length<5||message.length>1000||!Number.isInteger(rating)||rating<1||rating>5)return respond(400,{error:'Please Enter A Name, 1–5 Stars, And A Review Of 5–1000 Characters.'});
    const createdAt=new Date().toISOString();
    const key=createdAt+'-'+crypto.randomUUID();
    await store.setJSON(key,{name,message,rating,createdAt});
    return respond(201,{ok:true});
  }catch(err){console.error('Reviews function failed',err);return respond(500,{error:'Reviews Are Temporarily Unavailable.'})}
};
