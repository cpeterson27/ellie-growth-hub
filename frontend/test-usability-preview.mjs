// Local-only fixture harness: no request can reach a provider or database.
import { createServer } from "vite";
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import Contacts from "/src/pages/Contacts.jsx";
import TeamAccess from "/src/components/TeamAccess.jsx";
import {CoachingCoaches} from "/src/pages/CoachingAdmin.jsx";
import SocialLeads from "/src/pages/SocialLeads.jsx";
import SocialStudio from "/src/pages/SocialStudio.jsx";
import Content from "/src/pages/Content.jsx";
import api from "/src/services/api.js";
import "/src/index.css";
const contact={_id:"fixture-contact",name:"Jordan Example",email:"jordan@example.test",status:"prospect",campaignIds:[],sources:[],tags:[]};
const flags=new URLSearchParams(location.search);
const caption={_id:"fixture-post",title:"Example post",body:"A manually written caption.",type:"social",source:"human",status:"approved",social:{destinations:[{provider:"facebook",assetId:"fixture-page",mode:"api"}],media:[],publications:[]}};
let posts=[caption];
api.defaults.adapter = async config => {
  let data;
  if(config.url === "/content" && config.method === "post"){const input=JSON.parse(config.data);const saved={...input,_id:"saved-draft",status:"draft"};posts.push(saved);data={data:saved};}
  else if(config.url.endsWith("/schedule") && config.method === "post"){if(!flags.has("enabled"))throw Error("Fixture safety gate");posts=posts.map(row=>({...row,status:"scheduled"}));data={data:posts[0]};}
  else if(config.method !== "get") throw Error("Unexpected fixture mutation blocked");
  else if(config.url === "/contacts")data={data:flags.has("empty")||config.params?.status==="unsubscribed"?[]:[contact]};
  else if(config.url === "/content")data={data:posts};
  else if(config.url === "/content/social/capabilities")data={data:[{provider:"facebook",status:"api",asset:{id:"fixture-page",name:"Example Facebook Page"}},{provider:"instagram",status:"unavailable",reason:"Not connected"}]};
  else if(config.url === "/workspace/members")data={members:[]};
  else if(config.url === "/workspace/capabilities")data={capabilities:[],roleDefaults:{}};
  else if(config.url === "/coaching/programs" || config.url === "/coaching/coaches")data={data:[]};
  else if(config.url === "/social-workspace/accounts")data={publishingEnabled:flags.has("enabled"),connections:[]};
  else if(config.url === "/social-workspace/relations")data={offerings:[],events:[]};
  else if(config.url === "/social-workspace/media" || config.url === "/social-workspace/communications")data=[];
  else if(config.url === "/social-automation/leads")data={data:flags.has("empty")?[]:[{_id:"identity",provider:"instagram",username:"jordan.example",contactId:contact,lastActivityAt:"2026-08-26T15:00:00Z",latestInteraction:{type:"comment_received",hasSourcePost:true},conversation:{id:"fixture-thread",status:"open",preview:"DEAL — I'd like to learn more.",assignedTo:{id:"fixture-owner",name:"Workspace owner"}}}]};
  else if(config.url.includes("overview"))data={data:{totalContacts:flags.has("empty")?0:1}};
  else if(config.url.includes("campaigns"))data=[];
  else if(config.url.includes("imports"))data={data:null};
  else throw Error("Unexpected fixture request blocked: "+config.url);
  return {data,status:200,statusText:"OK",headers:{},config};
};
const path=location.pathname;
const screen=path==="/settings/team"?React.createElement(TeamAccess,{canManage:true,actorRoles:["owner"]}):path==="/coaching/coaches"?React.createElement(CoachingCoaches):path==="/social-leads"?React.createElement(SocialLeads):path==="/social/create"?React.createElement(SocialStudio):path==="/social/content"?React.createElement(Content):React.createElement(Contacts);
createRoot(document.getElementById("root")).render(React.createElement(BrowserRouter,null,screen));
`;
const server = await createServer({server:{host:"127.0.0.1",port:5181,strictPort:true},plugins:[{
  name:"usability-fixtures",
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!["/crm/contacts","/settings/team","/coaching/coaches","/social-leads","/social/create","/social/content"].some(path=>req.url.split("?")[0]===path))return next();
    res.setHeader("Content-Type","text/html");
    res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/@id/virtual:usability-fixture"></script></body></html>'));
  });},
  resolveId(id){if(id==="virtual:usability-fixture")return "\0usability-fixture.jsx";},
  load(id){if(id==="\0usability-fixture.jsx")return fixture;}
}]});
await server.listen();
console.log("Mocked usability preview: http://127.0.0.1:5181/crm/contacts");
