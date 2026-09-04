import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import PersonIdentityFields from "./PersonIdentityFields.jsx";
import { personName } from "../utils/personIdentity.js";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import UserAvatar from "./UserAvatar.jsx";
import {
  cancelWorkspaceInvitation,
  createWorkspaceMember,
  fetchCoachingPrograms,
  fetchWorkspaceCapabilities,
  fetchWorkspaceInvitationPreview,
  fetchWorkspaceMembers,
  removeWorkspaceMember,
  resetWorkspaceRolePermissions,
  saveWorkspaceRolePermissions,
  sendWorkspaceInvitation,
  updateWorkspaceMember,
} from "../services/api.js";
import { communityUrlError } from "../utils/ambassadorReferralFields.js";
import { invitationPreviewParts } from "../utils/invitationTemplateTokens.js";
import "./TeamAccess.css";

import {
  accessGroups,
  inviteRoles,
  lifecycleLabel,
  overrideValue,
  roleLabels,
  setOverride,
} from "./teamAccessPresentation.js";
const toggle = (items, value) =>
  items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
const memberStatusLabel = (member) => {
  const label = lifecycleLabel(member);
  return label === "Disabled"
    ? "Inactive"
    : label === "Invitation expired"
      ? "Expired"
      : label;
};
function ActualInvitationPreview({ value, variables, subject = false }) {
  return invitationPreviewParts(value, variables).map((part, index) =>
    part.type === "button" ? (
      subject ? (
        <span key={index}>Secure invitation</span>
      ) : (
        <button key={index} type="button" disabled>
          Accept invitation
        </button>
      )
    ) : (
      <span key={index}>{part.value}</span>
    ),
  );
}

export default function TeamAccess({ canManage, actorRoles = [] }) {
  const [members, setMembers] = useState([]),
    [catalog, setCatalog] = useState({ capabilities: [], roleDefaults: {} }),
    [programs, setPrograms] = useState([]);
  const [editing, setEditing] = useState(null),
    [draft, setDraft] = useState(null),
    [preview, setPreview] = useState(null),
    [canceling, setCanceling] = useState(null),
    [removing, setRemoving] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [communityError, setCommunityError] = useState(""),
    [saving, setSaving] = useState(false),
    [resendingId, setResendingId] = useState(""),
    [removingId, setRemovingId] = useState(""),
    [resendFeedback, setResendFeedback] = useState({});
  const resendInFlight = useRef(new Set()),
    removalInFlight = useRef(new Set());
  const blankInvite = {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    roles: ["member"],
    timezone: "",
    capacity: "",
    programIds: [],
    communityUrl: "",
    commissionMode: "manual",
    ratePercent: "",
    fixedAmount: "",
    notes: "",
  };
  const [params] = useSearchParams();
  const [tab, setTab] = useState("people"),
    [showInvite, setShowInvite] = useState(false),
    [roleDraft, setRoleDraft] = useState("admin");
  const availableRoles = inviteRoles(actorRoles);
  const [invite, setInvite] = useState(() => ({
    ...blankInvite,
    roles: params.get("role") === "ambassador" ? ["ambassador"] : ["member"],
  }));
  const load = async () => {
    try {
      const [team, caps, programRows] = await Promise.all([
        fetchWorkspaceMembers(),
        fetchWorkspaceCapabilities(),
        fetchCoachingPrograms({ limit: 200 }).catch(() => []),
      ]);
      setMembers(team.members || []);
      setCatalog(caps);
      setPrograms(programRows || []);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load Team & Access.");
    }
  };
  useEffect(() => {
    const initialLoad = window.setTimeout(load, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);
  const begin = (member) => {
    setEditing(member.id);
    setDraft({
      roles: [...member.roles],
      status: member.status,
      permissionOverrides: {
        allow: [...(member.permissionOverrides?.allow || [])],
        deny: [...(member.permissionOverrides?.deny || [])],
      },
      responsibilities: {
        programIds: (member.responsibilities?.programIds || []).map(String),
        applicationProgramIds: (
          member.responsibilities?.applicationProgramIds || []
        ).map(String),
        salesPipelineIds: member.responsibilities?.salesPipelineIds || [],
      },
    });
  };
  const save = async (id) => {
    try {
      setSaving(true);
      const result = await updateWorkspaceMember(id, draft);
      setMembers((rows) =>
        rows.map((row) => (row.id === id ? result.member : row)),
      );
      setEditing(null);
      setDraft(null);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to update team access.");
    } finally {
      setSaving(false);
    }
  };
  const add = async (event) => {
    event.preventDefault();
    const urlError = communityUrlError(invite.communityUrl);
    setCommunityError(urlError);
    if (urlError) return;
    try {
      setSaving(true);
      const payload = {
        ...invite,
        name: personName(invite),
        capacity: invite.capacity === "" ? null : Number(invite.capacity),
        commissionConfig: {
          mode: invite.commissionMode,
          rateBps: Math.round((Number(invite.ratePercent) || 0) * 100),
          fixedAmountMinor: Math.round((Number(invite.fixedAmount) || 0) * 100),
          currency: "USD",
        },
      };
      const result = await createWorkspaceMember(payload);
      setMembers((rows) => [
        ...rows.filter((row) => row.id !== result.member.id),
        result.member,
      ]);
      if (result.invitation) {
        setPreview({
          ...result.invitation,
          recipient: invite.email,
          displayName: result.invitation.previewVariables?.displayName || result.member.name || personName(invite),
          role: result.invitation.previewVariables?.role || invite.roles.map((role) => roleLabels[role]).join(", "),
        });
        setShowInvite(false);
      } else
        setError(
          "Existing active workspace member reused; no invitation was needed.",
        );
      setInvite(blankInvite);
      setCommunityError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to prepare invitation.");
    } finally {
      setSaving(false);
    }
  };
  const changeRolePermission = (permission) =>
    setCatalog((current) => ({
      ...current,
      roleDefaults: {
        ...current.roleDefaults,
        [roleDraft]: toggle(current.roleDefaults[roleDraft] || [], permission),
      },
    }));
  const saveRole = async () => {
    try {
      setSaving(true);
      const result = await saveWorkspaceRolePermissions(
        roleDraft,
        catalog.roleDefaults[roleDraft] || [],
      );
      setCatalog((current) => ({
        ...current,
        roleDefaults: result.roleDefaults,
      }));
      setNotice(`${roleLabels[roleDraft]} permissions saved.`);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to save role permissions.");
    } finally {
      setSaving(false);
    }
  };
  const resetRole = async () => {
    try {
      setSaving(true);
      const result = await resetWorkspaceRolePermissions(roleDraft);
      setCatalog((current) => ({
        ...current,
        roleDefaults: result.roleDefaults,
      }));
      setNotice(`${roleLabels[roleDraft]} reset to Lead Porch defaults.`);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to reset role permissions.",
      );
    } finally {
      setSaving(false);
    }
  };
  const send = async () => {
    try {
      setSaving(true);
      await sendWorkspaceInvitation(preview.id, {
        subject: preview.subject,
        body: preview.body,
      });
      setPreview(null);
      setError("");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send invitation.");
    } finally {
      setSaving(false);
    }
  };
  const reopen = async (member) => {
    if (!member.invitation) return;
    try {
      setSaving(true);
      const invitation = await fetchWorkspaceInvitationPreview(
        member.invitation.id,
      );
      setPreview({
        ...invitation,
        recipient: member.email,
        displayName: invitation.previewVariables?.displayName || member.name,
        role:
          invitation.previewVariables?.role ||
          member.roles.map((role) => roleLabels[role]).join(", "),
      });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to prepare the invitation preview.",
      );
    } finally {
      setSaving(false);
    }
  };
  const resend = async (member) => {
    const invitationId = member.invitation?.id;
    if (!invitationId || resendInFlight.current.has(invitationId)) return;
    resendInFlight.current.add(invitationId);
    setResendingId(invitationId);
    setError("");
    setResendFeedback((current) => ({ ...current, [invitationId]: null }));
    try {
      const result = await sendWorkspaceInvitation(invitationId);
      setMembers((rows) =>
        rows.map((row) =>
          row.id === member.id
            ? {
                ...row,
                invitation: { ...row.invitation, ...result.invitation },
              }
            : row,
        ),
      );
      setResendFeedback((current) => ({
        ...current,
        [invitationId]: {
          status: "sent",
          email: member.email,
          sentAt: result.invitation?.sentAt || new Date().toISOString(),
        },
      }));
    } catch (err) {
      setResendFeedback((current) => ({
        ...current,
        [invitationId]: {
          status: "failed",
          email: member.email,
          message:
            err.response?.data?.error ||
            "Unable to resend invitation. Please try again.",
        },
      }));
    } finally {
      resendInFlight.current.delete(invitationId);
      setResendingId("");
    }
  };
  const removeMember = async () => {
    const memberId = removing?.id;
    if (!memberId || removalInFlight.current.has(memberId)) return;
    removalInFlight.current.add(memberId);
    setRemovingId(memberId);
    setError("");
    setNotice("");
    try {
      await removeWorkspaceMember(memberId);
      setMembers((rows) => rows.filter((row) => row.id !== memberId));
      setEditing(null);
      setDraft(null);
      setRemoving(null);
      setNotice(`${removing.name} was removed from this workspace.`);
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to remove this team member.",
      );
    } finally {
      removalInFlight.current.delete(memberId);
      setRemovingId("");
    }
  };
  const cancelInvite = async () => {
    try {
      setSaving(true);
      await cancelWorkspaceInvitation(canceling.invitation.id);
      setCanceling(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to cancel invitation.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="account-settings-panel account-settings-panel--refined team-access">
      <header className="team-access__page-header">
        <div>
          <p className="page-eyebrow">Workspace settings</p>
          <h2>Team & Access</h2>
          <p>Manage people and access for this workspace.</p>
        </div>
        {canManage && tab === "people" ? (
          <Button onClick={() => setShowInvite(true)}>+ Add person</Button>
        ) : null}
      </header>
      <nav className="team-access__tabs" aria-label="Team and access sections">
        <button
          type="button"
          className={tab === "people" ? "is-active" : ""}
          onClick={() => setTab("people")}
        >
          People
        </button>
        <button
          type="button"
          className={tab === "roles" ? "is-active" : ""}
          onClick={() => setTab("roles")}
        >
          Roles &amp; Permissions
        </button>
      </nav>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? (
        <p className="discovery-notice" role="status">
          {notice}
        </p>
      ) : null}
      {canceling ? (
        <section
          className="settings-section team-access__preview"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-invitation-title"
        >
          <p className="page-eyebrow">Team access</p>
          <h3 id="cancel-invitation-title">Cancel invitation?</h3>
          <p>
            This revokes the secure signup link for{" "}
            <strong>{canceling.name}</strong> and removes pending access. It
            does not delete historical records.
          </p>
          <div>
            <Button loading={saving} onClick={cancelInvite}>
              Confirm cancellation
            </Button>
            <Button variant="outline" onClick={() => setCanceling(null)}>
              Keep invitation
            </Button>
          </div>
        </section>
      ) : null}
      <Modal
        isOpen={Boolean(removing)}
        onClose={() => {
          if (!removingId) setRemoving(null);
        }}
        title="Remove team member"
        className="team-access__remove-modal"
        footer={
          removing ? (
            <>
              <Button
                variant="outline"
                disabled={removingId === removing.id}
                onClick={() => setRemoving(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removingId === removing.id}
                onClick={removeMember}
              >
                Remove member
              </Button>
            </>
          ) : null
        }
      >
        {removing ? (
          <div className="team-access__remove-confirmation">
            <p>
              Are you sure you want to remove this person from the workspace?
            </p>
            <div>
              <UserAvatar user={removing} size="sm" />
              <span>
                <strong>{removing.name}</strong>
                <small>{removing.email}</small>
              </span>
            </div>
            <p>
              They will lose Lead Porch access and any pending invitation
              link will stop working. Their CRM Contacts and business records
              will stay intact.
            </p>
          </div>
        ) : null}
      </Modal>
      {tab === "people" ? (
        <>
          <section className="settings-section team-access__members">
            {members.map((member) => (
              <article key={member.id}>
                <header className="team-access__member-header">
                  <div className="team-access__identity">
                    <UserAvatar user={member} size="sm" />
                    <div className="team-access__identity-copy">
                      <strong className="team-access__name">
                        {member.name}
                      </strong>
                      <small className="team-access__email">
                        {member.email}
                      </small>
                      <div className="team-access__roles">
                        {member.roles.map((role) => (
                          <em key={role}>
                            {roleLabels[role] || "Team member"}
                          </em>
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="team-access__status">
                    {memberStatusLabel(member)}
                  </span>
                  {canManage &&
                  (actorRoles.includes("owner") ||
                    !member.roles.includes("owner")) ? (
                    <div className="team-access__member-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => begin(member)}
                      >
                        Manage access
                      </Button>
                      {!member.isSelf ? (
                        <Button
                          className="team-access__remove"
                          variant="danger"
                          size="sm"
                          disabled={Boolean(removingId)}
                          onClick={() => setRemoving(member)}
                        >
                          Remove member
                        </Button>
                      ) : null}
                      {member.invitation && member.status === "invited" ? (
                        <>
                          <Button
                            className="team-access__resend"
                            variant="outline"
                            size="sm"
                            loading={resendingId === member.invitation.id}
                            onClick={() =>
                              member.invitation.sentAt
                                ? resend(member)
                                : reopen(member)
                            }
                          >
                            {resendingId === member.invitation.id
                              ? "Sending…"
                              : member.invitation.sentAt
                                ? "Resend invitation"
                                : "Review invitation"}
                          </Button>
                          <Button
                            className="team-access__resend"
                            variant="ghost"
                            size="sm"
                            disabled={resendingId === member.invitation.id}
                            onClick={() => setCanceling(member)}
                          >
                            Cancel invitation
                          </Button>
                          {resendFeedback[member.invitation.id] ? (
                            <div
                              className={`team-access__resend-feedback is-${resendFeedback[member.invitation.id].status}`}
                              role="status"
                              aria-live="polite"
                            >
                              <strong>
                                {resendFeedback[member.invitation.id].status ===
                                "sent"
                                  ? "Invite resent"
                                  : "Delivery failed"}
                              </strong>
                              <span>
                                {resendFeedback[member.invitation.id].status ===
                                "sent"
                                  ? `Sent just now to ${resendFeedback[member.invitation.id].email}`
                                  : resendFeedback[member.invitation.id]
                                      .message}
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </header>
                {editing === member.id && draft ? (
                  <div className="team-access__editor">
                    <fieldset>
                      <legend>Role templates</legend>
                      {availableRoles.map((role) => (
                        <label key={role}>
                          <input
                            type="checkbox"
                            checked={draft.roles.includes(role)}
                            onChange={() =>
                              setDraft({
                                ...draft,
                                roles: toggle(draft.roles, role),
                              })
                            }
                          />
                          {roleLabels[role]}
                          <small>
                            {catalog.roleDescriptions?.[role] || ""}
                          </small>
                        </label>
                      ))}
                    </fieldset>
                    <label>
                      Status
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDraft({ ...draft, status: event.target.value })
                        }
                        disabled={
                          member.roles.includes("owner") ||
                          draft.status === "invited"
                        }
                      >
                        {draft.status === "invited" ? (
                          <option value="invited">Invitation pending</option>
                        ) : null}
                        <option value="active">Active</option>
                        <option value="suspended">Inactive</option>
                      </select>
                    </label>
                    <section className="team-access__permissions">
                      <h3>Custom access</h3>
                      <p>
                        Role defaults combine when multiple roles are selected.
                        Choose Allow or No access to override a default.
                        Assignment and workspace boundaries still apply. Social
                        access is one existing permission, not separate
                        Send/Publish switches.
                      </p>
                      {member.roles.includes("owner") ||
                      draft.roles.includes("owner") ? (
                        <p>
                          Owner access is protected. Only Owners may change
                          Owner roles; the last active Owner cannot be removed.
                        </p>
                      ) : (
                        <>
                          {accessGroups.map(([group, items]) => (
                            <details key={group}>
                              <summary>{group}</summary>
                              {items
                                .filter(([id]) =>
                                  catalog.capabilities.includes(id),
                                )
                                .map(([id, label]) => {
                                  const enabledByRole = draft.roles.some(
                                    (role) =>
                                      catalog.roleDefaults[role]?.includes(id),
                                  );
                                  return (
                                    <label
                                      className="team-access__permission"
                                      key={id}
                                    >
                                      <span>
                                        {label}
                                        <small>
                                          Role default:{" "}
                                          {enabledByRole
                                            ? "Allowed"
                                            : "Not allowed"}
                                        </small>
                                      </span>
                                      <select
                                        aria-label={`${group}: ${label}`}
                                        value={overrideValue(
                                          draft.permissionOverrides,
                                          id,
                                        )}
                                        onChange={(event) =>
                                          setDraft({
                                            ...draft,
                                            permissionOverrides: setOverride(
                                              draft.permissionOverrides,
                                              id,
                                              event.target.value,
                                            ),
                                          })
                                        }
                                      >
                                        <option value="default">
                                          Use role default
                                        </option>
                                        <option value="allow">Allow</option>
                                        <option value="deny">No access</option>
                                      </select>
                                    </label>
                                  );
                                })}
                            </details>
                          ))}
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                permissionOverrides: { allow: [], deny: [] },
                              })
                            }
                          >
                            Reset to role defaults
                          </Button>
                        </>
                      )}
                    </section>
                    <fieldset className="team-access__responsibilities">
                      <legend>Program responsibilities</legend>
                      {programs.length ? (
                        programs.map((program) => (
                          <div
                            className="team-access__responsibility"
                            key={program._id}
                          >
                            <strong>{program.name}</strong>
                            <div className="team-access__responsibility-options">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={draft.responsibilities.programIds.includes(
                                    String(program._id),
                                  )}
                                  onChange={() =>
                                    setDraft({
                                      ...draft,
                                      responsibilities: {
                                        ...draft.responsibilities,
                                        programIds: toggle(
                                          draft.responsibilities.programIds,
                                          String(program._id),
                                        ),
                                      },
                                    })
                                  }
                                />
                                <span>Program access</span>
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={draft.responsibilities.applicationProgramIds.includes(
                                    String(program._id),
                                  )}
                                  onChange={() =>
                                    setDraft({
                                      ...draft,
                                      responsibilities: {
                                        ...draft.responsibilities,
                                        applicationProgramIds: toggle(
                                          draft.responsibilities
                                            .applicationProgramIds,
                                          String(program._id),
                                        ),
                                      },
                                    })
                                  }
                                />
                                <span>Applications</span>
                              </label>
                            </div>
                          </div>
                        ))
                      ) : (
                        <small>No programs are available to assign.</small>
                      )}
                    </fieldset>
                    <div>
                      <Button loading={saving} onClick={() => save(member.id)}>
                        Save access
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setDraft(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
          {canManage ? (
            <Modal
              isOpen={showInvite}
              onClose={() => !saving && setShowInvite(false)}
              title="Add person"
              className="team-access__invite-modal"
            >
              <form
                id="add-team-person"
                className="team-access__invite"
                onSubmit={add}
              >
                <p>
                  Choose their role and prepare a secure invitation. Nothing is
                  sent until you review it.
                </p>
                <PersonIdentityFields value={invite} onChange={setInvite} />
                <fieldset>
                  <legend>Initial roles</legend>
                  {availableRoles.map((role) => (
                    <label key={role}>
                      <input
                        type="checkbox"
                        checked={invite.roles.includes(role)}
                        onChange={() =>
                          setInvite({
                            ...invite,
                            roles: toggle(invite.roles, role),
                          })
                        }
                      />
                      {roleLabels[role]}
                    </label>
                  ))}
                </fieldset>
                {invite.roles.includes("coach") ? (
                  <fieldset>
                    <legend>Coach profile</legend>
                    <label>
                      Timezone
                      <input
                        value={invite.timezone}
                        onChange={(event) =>
                          setInvite({ ...invite, timezone: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Student capacity
                      <input
                        min="0"
                        type="number"
                        value={invite.capacity}
                        onChange={(event) =>
                          setInvite({ ...invite, capacity: event.target.value })
                        }
                      />
                    </label>
                    {programs.map((program) => (
                      <label key={program._id}>
                        <input
                          type="checkbox"
                          checked={invite.programIds.includes(
                            String(program._id),
                          )}
                          onChange={() =>
                            setInvite({
                              ...invite,
                              programIds: toggle(
                                invite.programIds,
                                String(program._id),
                              ),
                            })
                          }
                        />
                        {program.name}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                {invite.roles.includes("ambassador") ? (
                  <fieldset className="team-access__ambassador-fields">
                    <legend>Brand Ambassador profile</legend>
                    <div className="team-access__generated-referral">
                      <strong>Referral link</strong>
                      <span>
                        Lead Porch generates a unique referral code from
                        the ambassador’s name when this profile is created.
                      </span>
                    </div>
                    <label>
                      Community or group URL (optional)
                      <input
                        type="url"
                        aria-invalid={Boolean(communityError)}
                        value={invite.communityUrl}
                        onChange={(event) => {
                          setInvite({
                            ...invite,
                            communityUrl: event.target.value,
                          });
                          setCommunityError(
                            communityUrlError(event.target.value),
                          );
                        }}
                        placeholder="https://..."
                      />
                      <small>
                        Use this only if they manage a Facebook Group, Skool
                        community, Meetup group, LinkedIn Group, or another
                        community.
                      </small>
                      {communityError ? (
                        <span className="form-error" role="alert">
                          {communityError}
                        </span>
                      ) : null}
                    </label>
                    <label>
                      Commission method
                      <select
                        value={invite.commissionMode}
                        onChange={(event) =>
                          setInvite({
                            ...invite,
                            commissionMode: event.target.value,
                          })
                        }
                      >
                        <option value="manual">Manual per payout</option>
                        <option value="percent">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    </label>
                    {invite.commissionMode === "percent" ? (
                      <label>
                        Commission percent
                        <input
                          min="0"
                          max="100"
                          step="0.01"
                          type="number"
                          value={invite.ratePercent}
                          onChange={(event) =>
                            setInvite({
                              ...invite,
                              ratePercent: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : null}
                    {invite.commissionMode === "fixed" ? (
                      <label>
                        Fixed amount (USD)
                        <input
                          min="0"
                          step="0.01"
                          type="number"
                          value={invite.fixedAmount}
                          onChange={(event) =>
                            setInvite({
                              ...invite,
                              fixedAmount: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : null}
                    <label>
                      Internal notes
                      <input
                        value={invite.notes}
                        onChange={(event) =>
                          setInvite({ ...invite, notes: event.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                ) : null}
                <div className="team-access__invite-actions">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setShowInvite(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={saving}
                    disabled={
                      !invite.firstName.trim() ||
                      !invite.lastName.trim() ||
                      !invite.email.includes("@") ||
                      !invite.roles.length ||
                      Boolean(communityError)
                    }
                  >
                    Create invite preview
                  </Button>
                </div>
              </form>
            </Modal>
          ) : null}
          {preview ? (
            <section className="settings-section team-access__preview">
              <p className="page-eyebrow">Review before sending</p>
              <h3>Invitation preview</h3>
              <p>
                <strong>Recipient:</strong> {preview.displayName} ·{" "}
                {preview.recipient}
              </p>
              <p>
                <strong>Role:</strong> {preview.role}
              </p>
              <label>
                Email subject
                <input
                  value={preview.subject}
                  onChange={(event) =>
                    setPreview({ ...preview, subject: event.target.value })
                  }
                />
              </label>
              <label>
                Invitation message
                <textarea
                  rows="10"
                  value={preview.body}
                  onChange={(event) =>
                    setPreview({ ...preview, body: event.target.value })
                  }
                />
              </label>
              <article>
                <strong>
                  <ActualInvitationPreview value={preview.subject} variables={preview.previewVariables} subject />
                </strong>
                <p className="team-access__recipient-preview-message"><ActualInvitationPreview value={preview.body} variables={preview.previewVariables} /></p>
              </article>
              <div>
                <Button loading={saving} onClick={send}>
                  Send invitation
                </Button>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Keep as draft
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="team-access__role-settings">
          <aside aria-label="Role templates">
            {Object.keys(roleLabels)
              .filter((role) => catalog.roleDefaults?.[role])
              .map((role) => (
                <button
                  type="button"
                  key={role}
                  className={roleDraft === role ? "is-active" : ""}
                  onClick={() => setRoleDraft(role)}
                >
                  {roleLabels[role]}
                </button>
              ))}
          </aside>
          <div className="team-access__role-editor">
            <header>
              <div>
                <h3>{roleLabels[roleDraft]}</h3>
                <p>{catalog.roleDescriptions?.[roleDraft]}</p>
              </div>
              {roleDraft === "owner" ? (
                <span className="team-access__protected">Protected</span>
              ) : null}
            </header>
            {accessGroups.map(([group, items]) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {items
                  .filter(([id]) => catalog.capabilities.includes(id))
                  .map(([id, label]) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={(
                          catalog.roleDefaults[roleDraft] || []
                        ).includes(id)}
                        disabled={
                          roleDraft === "owner" || !catalog.canEditRoleTemplates
                        }
                        onChange={() => changeRolePermission(id)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
              </fieldset>
            ))}
            {roleDraft !== "owner" && catalog.canEditRoleTemplates ? (
              <div className="team-access__role-actions">
                <Button loading={saving} onClick={saveRole}>
                  Save changes
                </Button>
                <Button variant="outline" disabled={saving} onClick={resetRole}>
                  Reset to default
                </Button>
              </div>
            ) : (
              <p className="team-access__protected-note">
                Owner access keeps the core permissions required to administer
                and secure the workspace.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
