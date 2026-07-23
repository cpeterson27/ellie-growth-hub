/**
 * Marketing Action Service
 * Converts GrowthOpportunity recommendations into executable marketing actions
 */

const GrowthOpportunity = require("../models/GrowthOpportunity");
const MarketingCampaign = require("../models/MarketingCampaign");
const Organization = require("../models/Organization");
const OrganizationRelationship = require("../models/OrganizationRelationship");

class MarketingActionService {
  /**
   * Get executable actions for an operator
   * Converts opportunities into actionable marketing tasks
   * @param {String} operatorId - Growth operator ID
   * @param {Object} filters - Optional filters (status, opportunityType, minPriority)
   * @returns {Promise<Array>} Array of marketing actions
   */
  async getOperatorActions(operatorId, filters = {}) {
    try {
      // Build opportunities query
      const query = { growthOperatorId: operatorId };

      if (filters.status) query.status = filters.status;
      if (filters.opportunityType)
        query.opportunityType = filters.opportunityType;
      if (filters.minPriority)
        query.priorityScore = { $gte: filters.minPriority };

      // Fetch opportunities
      const opportunities = await GrowthOpportunity.find(query)
        .sort({ priorityScore: -1 })
        .lean();

      if (opportunities.length === 0) {
        return [];
      }

      // Convert opportunities to actions
      const actions = [];
      for (const opp of opportunities) {
        const action = await this.convertOpportunityToAction(opp);
        if (action) {
          actions.push(action);
        }
      }

      return actions;
    } catch (error) {
      console.error(
        "[MarketingActionService] Error getting operator actions:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Convert a single opportunity to a marketing action
   * @private
   * @param {Object} opportunity - GrowthOpportunity document
   * @returns {Promise<Object|null>} Action object or null if conversion fails
   */
  async convertOpportunityToAction(opportunity) {
    try {
      // Fetch related data
      const [organization, relationship, existingCampaigns] = await Promise.all(
        [
          Organization.findById(opportunity.organizationId).select(
            "name priorityScore audienceScore",
          ),
          OrganizationRelationship.findOne({
            organizationId: opportunity.organizationId,
            audienceId: opportunity.audienceId,
          }).select("status"),
          MarketingCampaign.find({
            organizationId: opportunity.organizationId,
            audienceId: opportunity.audienceId,
            status: { $in: ["draft", "scheduled", "active"] },
          }).select("type status _id"),
        ],
      );

      if (!organization) {
        return null;
      }

      // Determine action status based on opportunity status
      const actionStatus = this.determineActionStatus(
        opportunity,
        existingCampaigns,
      );

      // Build action object
      const action = {
        opportunityId: opportunity._id,
        organizationId: opportunity.organizationId,
        organizationName: organization.name,
        organizationPriority: organization.priorityScore,
        opportunityType: opportunity.opportunityType,
        reasons: opportunity.reasons,
        recommendedAction: opportunity.suggestedAction,
        priority: opportunity.priorityScore,
        status: actionStatus,
        opportunityStatus: opportunity.status,
      };

      // Add action-specific details
      if (opportunity.suggestedAction === "create_campaign") {
        action.campaignDetails = {
          suggestedType: opportunity.suggestedCampaign?.type,
          suggestedName: opportunity.suggestedCampaign?.name,
          suggestedDescription: opportunity.suggestedCampaign?.description,
          existingCampaigns: existingCampaigns.map((c) => ({
            id: c._id,
            type: c.type,
            status: c.status,
          })),
        };
      } else if (opportunity.suggestedAction === "update_relationship") {
        action.relationshipDetails = {
          currentStatus: relationship?.status,
          suggestedStatus:
            opportunity.suggestedRelationshipUpdate?.recommendedStatus,
          reason: opportunity.suggestedRelationshipUpdate?.reason,
        };
      } else if (opportunity.suggestedAction === "send_outreach") {
        action.outreachDetails = {
          reason: opportunity.reasons.join("; "),
        };
      } else if (opportunity.suggestedAction === "review_manually") {
        action.reviewDetails = {
          reason: opportunity.reasons.join("; "),
          notes: opportunity.notes,
        };
      }

      return action;
    } catch (error) {
      console.error(
        "[MarketingActionService] Error converting opportunity:",
        error.message,
      );
      return null;
    }
  }

  /**
   * Determine the execution status of an action
   * @private
   * @param {Object} opportunity - Opportunity document
   * @param {Array} campaigns - Existing campaigns for this org/audience
   * @returns {String} Status: ready, in_progress, completed, or pending
   */
  determineActionStatus(opportunity, campaigns) {
    // If opportunity is already actioned, check progress
    if (opportunity.status === "actioned") {
      if (
        opportunity.actionTaken?.campaignId ||
        opportunity.actionTaken?.relationshipUpdateId
      ) {
        return "in_progress";
      }
      return "completed";
    }

    // If opportunity is skipped, mark as skipped
    if (opportunity.status === "skipped") {
      return "skipped";
    }

    // For identified opportunities
    if (opportunity.status === "identified") {
      // If action is create_campaign, check if campaign exists
      if (opportunity.suggestedAction === "create_campaign") {
        const campaignTypeNeeded = opportunity.suggestedCampaign?.type;
        const hasExistingCampaign = campaigns.some(
          (c) => c.type === campaignTypeNeeded,
        );

        if (hasExistingCampaign) {
          return "in_progress";
        }
      }

      return "ready";
    }

    return "pending";
  }

  /**
   * Filter actions by execution readiness
   * @param {Array} actions - Array of actions
   * @param {String} readinessLevel - "ready", "in_progress", "completed", or "all"
   * @returns {Array} Filtered actions
   */
  filterByReadiness(actions, readinessLevel = "all") {
    if (readinessLevel === "all") {
      return actions;
    }

    return actions.filter((action) => action.status === readinessLevel);
  }

  /**
   * Group actions by recommended action type
   * @param {Array} actions - Array of actions
   * @returns {Object} Actions grouped by type
   */
  groupByActionType(actions) {
    const grouped = {
      create_campaign: [],
      update_relationship: [],
      send_outreach: [],
      review_manually: [],
    };

    for (const action of actions) {
      if (grouped[action.recommendedAction]) {
        grouped[action.recommendedAction].push(action);
      }
    }

    return grouped;
  }

  /**
   * Get action summary for an operator
   * @param {String} operatorId - Growth operator ID
   * @returns {Promise<Object>} Summary with counts by type and status
   */
  async getActionSummary(operatorId) {
    try {
      const actions = await this.getOperatorActions(operatorId);

      const summary = {
        totalActions: actions.length,
        byRecommendedAction: {
          create_campaign: 0,
          update_relationship: 0,
          send_outreach: 0,
          review_manually: 0,
        },
        byStatus: {
          ready: 0,
          in_progress: 0,
          completed: 0,
          skipped: 0,
          pending: 0,
        },
        byPriority: {
          high: 0, // 70+
          medium: 0, // 40-69
          low: 0, // <40
        },
      };

      for (const action of actions) {
        // Count by recommended action
        if (
          summary.byRecommendedAction[action.recommendedAction] !== undefined
        ) {
          summary.byRecommendedAction[action.recommendedAction]++;
        }

        // Count by status
        if (summary.byStatus[action.status] !== undefined) {
          summary.byStatus[action.status]++;
        }

        // Count by priority
        if (action.priority >= 70) {
          summary.byPriority.high++;
        } else if (action.priority >= 40) {
          summary.byPriority.medium++;
        } else {
          summary.byPriority.low++;
        }
      }

      return summary;
    } catch (error) {
      console.error(
        "[MarketingActionService] Error getting action summary:",
        error.message,
      );
      throw error;
    }
  }
}

module.exports = new MarketingActionService();
