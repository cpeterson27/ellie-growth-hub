/**
 * Growth Operator Service
 * Orchestrates the workflow: Audience → Organizations → Priority → Relationship → Opportunities
 */

const GrowthOperator = require("../models/GrowthOperator");
const GrowthOpportunity = require("../models/GrowthOpportunity");
const Audience = require("../models/Audience");
const Organization = require("../models/Organization");
const OrganizationRelationship = require("../models/OrganizationRelationship");
const MarketingCampaign = require("../models/MarketingCampaign");

class GrowthOperatorService {
  /**
   * Start analysis for an audience
   * @param {String} audienceId
   * @param {Object} config Optional configuration overrides
   * @returns {Promise<Object>} GrowthOperator instance
   */
  async analyzeAudience(audienceId, config = {}) {
    try {
      // Verify audience exists
      const audience = await Audience.findById(audienceId);
      if (!audience) {
        throw new Error("Audience not found");
      }

      // Create operator instance
      const operator = new GrowthOperator({
        audienceId,
        config: {
          minPriorityScore: config.minPriorityScore || 0,
          maxOrganizationsToProcess: config.maxOrganizationsToProcess || 1000,
          campaignTypes: config.campaignTypes || ["email", "social", "event"],
          relationshipStatuses: config.relationshipStatuses || [
            "new",
            "reviewing",
          ],
        },
      });

      await operator.save();

      // Run analysis asynchronously
      this.runAnalysis(operator._id, audienceId).catch((error) => {
        console.error("[GrowthOperatorService] Analysis error:", error.message);
      });

      return operator;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Run the actual analysis workflow
   * @private
   */
  async runAnalysis(operatorId, audienceId) {
    const operator = await GrowthOperator.findById(operatorId);

    try {
      // Get audience data
      const audience = await Audience.findById(audienceId);
      if (!audience) throw new Error("Audience not found");

      // Get all prioritized organizations for this audience
      const organizations = await Organization.find({
        _id: { $in: audience.organizationIds || [] },
        priorityScore: { $gte: operator.config.minPriorityScore },
      })
        .sort({ priorityScore: -1 })
        .limit(operator.config.maxOrganizationsToProcess)
        .lean();

      operator.metrics.organizationsAnalyzed = organizations.length;

      // Analyze each organization
      for (const org of organizations) {
        await this.analyzeOrganization(operator, org, audience);
      }

      // Mark as completed
      operator.status = "completed";
      operator.completedAt = new Date();
      operator.analyzedAt = new Date();
    } catch (error) {
      operator.status = "failed";
      operator.lastError = error.message;
      operator.errorCount += 1;
    }

    await operator.save();
  }

  /**
   * Analyze a single organization for opportunities
   * @private
   */
  async analyzeOrganization(operator, org, audience) {
    try {
      // Get relationship status
      const relationship = await OrganizationRelationship.findOne({
        organizationId: org._id,
        audienceId: audience._id,
      });

      // Get existing campaigns
      const campaigns = await MarketingCampaign.find({
        audienceId: audience._id,
        $or: [{ status: "active" }, { status: "scheduled" }],
      })
        .select("type status")
        .lean();

      const opportunities = this.identifyOpportunities(
        org,
        audience,
        relationship,
        campaigns,
        operator.config,
      );

      // Create opportunity records
      for (const opp of opportunities) {
        await GrowthOpportunity.create({
          growthOperatorId: operator._id,
          organizationId: org._id,
          audienceId: audience._id,
          ...opp,
        });

        operator.metrics.opportunitiesIdentified += 1;

        // Track suggested actions
        if (opp.suggestedAction === "create_campaign") {
          operator.metrics.campaignsRecommended += 1;
        } else if (opp.suggestedAction === "update_relationship") {
          operator.metrics.relationshipUpdatesRecommended += 1;
        }
      }
    } catch (error) {
      console.error(
        `[GrowthOperatorService] Error analyzing org ${org._id}:`,
        error.message,
      );
    }
  }

  /**
   * Identify marketing opportunities for an organization
   * @private
   */
  identifyOpportunities(org, audience, relationship, campaigns, config) {
    const opportunities = [];

    // Opportunity 1: High priority, no recent engagement
    if (org.priorityScore >= 80 && !relationship) {
      opportunities.push({
        opportunityType: "new_organization",
        reasons: [
          `High priority organization (${org.priorityScore}/100)`,
          "No relationship established yet",
          "Good fit for audience",
        ],
        priorityScore: org.priorityScore,
        suggestedAction: "create_campaign",
        suggestedCampaign: {
          type: config.campaignTypes[0] || "email",
          name: `Initial outreach to ${org.name}`,
          description: `First engagement campaign for newly discovered high-priority organization`,
        },
      });
    }

    // Opportunity 2: Relationship exists but needs campaign
    if (relationship && config.campaignTypes.length > 0) {
      const hasActiveEmailCampaign = campaigns.some(
        (c) => c.type === "email" && c.status === "active",
      );
      const hasActiveSocialCampaign = campaigns.some(
        (c) => c.type === "social" && c.status === "active",
      );

      if (!hasActiveEmailCampaign && config.campaignTypes.includes("email")) {
        opportunities.push({
          opportunityType: "needs_campaign",
          reasons: [
            "Relationship established",
            "No active email campaigns running",
            "Good time for engagement",
          ],
          priorityScore: org.priorityScore - 10,
          suggestedAction: "create_campaign",
          suggestedCampaign: {
            type: "email",
            name: `Email campaign for ${org.name}`,
            description: "Nurture existing relationship with email content",
          },
        });
      }

      if (!hasActiveSocialCampaign && config.campaignTypes.includes("social")) {
        opportunities.push({
          opportunityType: "needs_campaign",
          reasons: [
            "Relationship established",
            "No active social campaigns running",
            "Social engagement can increase visibility",
          ],
          priorityScore: org.priorityScore - 15,
          suggestedAction: "create_campaign",
          suggestedCampaign: {
            type: "social",
            name: `Social campaign for ${org.name}`,
            description: "Build awareness through social media content",
          },
        });
      }
    }

    // Opportunity 3: Relationship needs update
    if (relationship && config.relationshipStatuses.includes("qualified")) {
      if (relationship.status === "reviewing" && org.priorityScore >= 70) {
        opportunities.push({
          opportunityType: "relationship_update",
          reasons: [
            "Organization shows strong fit (70+ priority score)",
            "Currently in reviewing status",
            "Ready to advance relationship",
          ],
          priorityScore: 75,
          suggestedAction: "update_relationship",
          suggestedRelationshipUpdate: {
            currentStatus: relationship.status,
            recommendedStatus: "qualified",
            reason: "Strong priority score and good audience fit",
          },
        });
      }
    }

    // Opportunity 4: High priority but low engagement
    if (org.priorityScore >= 60 && relationship?.status === "new") {
      opportunities.push({
        opportunityType: "engagement_needed",
        reasons: [
          "Good priority score",
          "Relationship just started",
          "Early engagement critical",
        ],
        priorityScore: org.priorityScore,
        suggestedAction: "create_campaign",
        suggestedCampaign: {
          type: config.campaignTypes[0] || "email",
          name: `Engagement campaign for ${org.name}`,
          description: "Initial engagement to build momentum",
        },
      });
    }

    return opportunities;
  }

  /**
   * Get operator status
   * @param {String} operatorId
   * @returns {Promise<Object>}
   */
  async getOperator(operatorId) {
    const operator = await GrowthOperator.findById(operatorId);
    if (!operator) {
      throw new Error("Growth Operator not found");
    }
    return operator;
  }

  /**
   * Get opportunities for an operator
   * @param {String} operatorId
   * @param {Object} filters Optional filters
   * @returns {Promise<Array>}
   */
  async getOpportunities(operatorId, filters = {}) {
    const query = { growthOperatorId: operatorId };

    if (filters.status) query.status = filters.status;
    if (filters.opportunityType)
      query.opportunityType = filters.opportunityType;
    if (filters.minPriority)
      query.priorityScore = { $gte: filters.minPriority };

    return await GrowthOpportunity.find(query)
      .sort({ priorityScore: -1 })
      .limit(1000)
      .lean();
  }

  /**
   * Get opportunities for an organization
   * @param {String} organizationId
   * @param {String} audienceId
   * @returns {Promise<Array>}
   */
  async getOrganizationOpportunities(organizationId, audienceId) {
    return await GrowthOpportunity.find({
      organizationId,
      audienceId,
      status: "identified",
    })
      .sort({ priorityScore: -1 })
      .lean();
  }

  /**
   * Mark opportunity as actioned
   * @param {String} opportunityId
   * @param {Object} action Action details
   * @returns {Promise<Object>}
   */
  async markAsActioned(opportunityId, action = {}) {
    const opportunity = await GrowthOpportunity.findByIdAndUpdate(
      opportunityId,
      {
        status: "actioned",
        actionTaken: {
          timestamp: new Date(),
          ...action,
        },
      },
      { new: true },
    );

    if (!opportunity) {
      throw new Error("Opportunity not found");
    }

    return opportunity;
  }

  /**
   * Mark opportunity as skipped
   * @param {String} opportunityId
   * @param {String} reason
   * @returns {Promise<Object>}
   */
  async markAsSkipped(opportunityId, reason = "") {
    return await GrowthOpportunity.findByIdAndUpdate(
      opportunityId,
      {
        status: "skipped",
        "actionTaken.note": reason,
      },
      { new: true },
    );
  }
}

module.exports = new GrowthOperatorService();
