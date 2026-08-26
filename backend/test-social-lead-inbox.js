const assert = require("node:assert/strict");
const { list } = require("./services/socialLeadInboxService");
const workspaceId = "6a69491ceb8b0a51048bd0cd";
const query = value => ({populate(){return this;},select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>value});
(async()=>{
  await assert.rejects(list(null,{},{}),/workspace/);
  const rows = await list(workspaceId,{},{
    SocialIdentity:{find(filter){assert.equal(filter.workspaceId,workspaceId);return query([{_id:"identity",contactId:{_id:"contact",name:"Jordan"},provider:"instagram"},{_id:"orphan",contactId:null}]);}},
    SocialProviderEvent:{aggregate:async pipeline=>{assert.equal(String(pipeline[0].$match.workspaceId),workspaceId);return [{_id:"identity",event:{eventType:"comment_received",sourceMetadata:{contentId:"post"},threadId:"thread"}}];}},
    ConversationThread:{find(filter){assert.equal(filter.workspaceId,workspaceId);assert.deepEqual(filter._id.$in,["thread"]);return query([{_id:"thread",preview:"DEAL",status:"open",assignedTo:{_id:"user",name:"Owner"}}]);}}
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].latestInteraction.type,"comment_received");
  assert.equal(rows[0].conversation.preview,"DEAL");
  assert.equal(rows[0].conversation.assignedTo.name,"Owner");
  assert.equal(rows[0].latestInteraction.hasSourcePost,true);
  assert.deepEqual(await list(workspaceId,{}, {SocialIdentity:{find:()=>query([])}}),[]);
  console.log("Social lead read projection, source interaction, canonical contact, conversation, empty state and workspace-scoped joins passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
