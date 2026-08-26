import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { personName, personFields } from "./src/utils/personIdentity.js";
import { publishingBlocker } from "./src/utils/socialPublishingReadiness.js";
import { interactionLabels, leadStage } from "./src/pages/socialLeadPresentation.js";
assert.equal(personName({firstName:"  Jordan ",lastName:" Taylor  "}),"Jordan Taylor");
assert.deepEqual(personFields({name:"Jordan Taylor",phone:"555"}),{firstName:"Jordan",lastName:"Taylor",email:"",phone:"555"});
assert.equal(personFields({name:"Jordan Taylor",firstName:"Jordan"}).lastName,"Taylor");
const cap=[{provider:"facebook",status:"api",asset:{id:"page"}}];
const item={social:{destinations:[{provider:"facebook",assetId:"page"}],media:[]}};
assert.match(publishingBlocker(item,cap,false),/disabled/);
assert.equal(publishingBlocker(item,cap,true),"");
assert.match(publishingBlocker({social:{destinations:[{provider:"facebook",assetId:"foreign"}]}},cap,true),/unavailable/);
assert.match(publishingBlocker({social:{destinations:[{provider:"instagram",assetId:"ig"}]}},[{provider:"instagram",status:"api",asset:{id:"ig"}}],true),/image/);
assert.equal(interactionLabels.comment_received,"Commented on a post");
assert.equal(leadStage({contactId:{type:"customer"}}),"Converted");
assert.equal(leadStage({conversation:{status:"open"}}),"Needs follow-up");
const read=path=>fs.readFileSync(path,"utf8");
for(const path of ["src/components/TeamAccess.jsx","src/pages/CoachingAdmin.jsx","src/pages/AcceptInvitation.jsx"])assert(read(path).includes("PersonIdentityFields"));
const content=read("src/pages/Content.jsx");
assert(content.includes("publishingBlocker(item,matrix,publishingEnabled)"));
assert(content.includes("act(scheduleSocialContent,item._id,new Date().toISOString())"));
assert(read("src/pages/SocialStudio.jsx").includes("createContentBrief(draft)"));
globalThis.localStorage={getItem:()=>null};
const lead={_id:"identity",provider:"instagram",username:"jordan",contactId:{_id:"contact",name:"Jordan Example",status:"prospect"},latestInteraction:{type:"comment_received"},conversation:{id:"thread",preview:"DEAL",status:"open"}};
for(const rows of [[],[lead]]){
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",plugins:[{name:"lead-render-fixture",enforce:"pre",transform(code,id){if(id.endsWith("/pages/SocialLeads.jsx"))return code.replace("useState([])",`useState(${JSON.stringify(rows)})`).replace("[loading, setLoading] = useState(true)","[loading, setLoading] = useState(false)");}}]});
  try{
    const {default:Leads}=await server.ssrLoadModule("/src/pages/SocialLeads.jsx");
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(Leads)));
    assert(html.includes(rows.length?"Commented on a post":"Your social conversations start here"));
    if(rows.length){assert(html.includes("DEAL"));assert(html.includes("/social/inbox?thread=thread"));assert(html.includes("/crm/contacts/contact"));}
    const {default:Fields}=await server.ssrLoadModule("/src/components/PersonIdentityFields.jsx");
    const fields=renderToStaticMarkup(createElement(Fields,{value:{},onChange(){}}));
    for(const label of ["First name","Last name","Email","Phone number (optional)"])assert(fields.includes(label));
    const {default:Contacts}=await server.ssrLoadModule("/src/pages/Contacts.jsx");
    assert(renderToStaticMarkup(createElement(MemoryRouter,null,createElement(Contacts))).includes("Search contacts"));
  }finally{await server.close();}
}
console.log("Shared identity rendering, CRM initial render, Social Leads empty/source rendering and publish safety/selected-asset wiring passed.");
