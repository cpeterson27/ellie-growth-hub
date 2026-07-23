/**
 * Bootcamp Marketing Workflow Service
 * Creates repeatable event promotion campaigns with templates and scheduling
 */

const MarketingCampaign = require("../models/MarketingCampaign");
const Audience = require("../models/Audience");
const marketingCampaignExecutionService = require("./marketingCampaignExecution");

class BootcampMarketingWorkflowService {
  /**
   * Campaign templates for bootcamp/event promotion
   * @returns {Object} Available templates
   */
  getTemplates() {
    return {
      announcement: {
        name: "Bootcamp Announcement",
        description: "Initial announcement of upcoming bootcamp",
        subject: "🚀 Exciting Bootcamp Coming Soon!",
        htmlBody: `
          <h1>Join Our Upcoming Bootcamp</h1>
          <p>We're excited to announce our latest bootcamp program designed to help you grow.</p>
          <h2>What You'll Learn:</h2>
          <ul>
            <li>Latest industry practices</li>
            <li>Hands-on projects</li>
            <li>Expert mentorship</li>
          </ul>
          <p><a href="{{callToActionUrl}}">Learn More & Register</a></p>
        `,
        callToAction: "Register Now",
      },
      earlyBird: {
        name: "Early Bird Offer",
        description: "Exclusive early-bird pricing for bootcamp",
        subject: "⏰ Early Bird Offer - Limited Time",
        htmlBody: `
          <h1>Early Bird Special Offer</h1>
          <p>Secure your spot with our exclusive early-bird discount.</p>
          <h2>Offer Details:</h2>
          <ul>
            <li>25% off early registration</li>
            <li>Limited to first 50 participants</li>
            <li>Offer expires {{expiryDate}}</li>
          </ul>
          <p><a href="{{callToActionUrl}}">Claim Your Spot</a></p>
        `,
        callToAction: "Get Early Bird Access",
      },
      reminder: {
        name: "Bootcamp Reminder",
        description: "Reminder for registered participants",
        subject: "📅 Bootcamp Starting Soon - Your Reminder",
        htmlBody: `
          <h1>Your Bootcamp is Starting Soon!</h1>
          <p>Get ready for an amazing learning experience.</p>
          <h2>Important Details:</h2>
          <ul>
            <li>Start Date: {{startDate}}</li>
            <li>Duration: {{duration}}</li>
            <li>Format: {{format}}</li>
          </ul>
          <p><a href="{{callToActionUrl}}">Access Bootcamp</a></p>
        `,
        callToAction: "Access Now",
      },
      followUp: {
        name: "Post-Bootcamp Follow-up",
        description: "Follow-up after bootcamp completion",
        subject: "✅ Congratulations on Completing the Bootcamp!",
        htmlBody: `
          <h1>You Did It! 🎉</h1>
          <p>Congratulations on completing our bootcamp program.</p>
          <h2>What's Next:</h2>
          <ul>
            <li>Access certificate of completion</li>
            <li>Join alumni network</li>
            <li>Explore advanced programs</li>
          </ul>
          <p><a href="{{callToActionUrl}}">Explore Next Steps</a></p>
        `,
        callToAction: "Continue Learning",
      },
    };
  }

  /**
   * Get a specific template
   * @param {String} templateName - Template identifier
   * @returns {Object|null} Template or null
   */
  getTemplate(templateName) {
    const templates = this.getTemplates();
    return templates[templateName] || null;
  }

  /**
   * Create a bootcamp campaign from template
   * @param {String} audienceId - Audience ID
   * @param {String} templateName - Template to use
   * @param {Object} options - Campaign options {name, callToActionUrl, variables}
   * @returns {Promise<Object>} Created campaign
   */
  async createBootcampCampaign(audienceId, templateName, options = {}) {
    try {
      // Verify audience exists
      const audience = await Audience.findById(audienceId);
      if (!audience) {
        throw new Error("Audience not found");
      }

      // Get template
      const template = this.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Build content with variable substitution
      let htmlBody = template.htmlBody;
      let subject = template.subject;

      // Replace variables
      if (options.variables) {
        Object.entries(options.variables).forEach(([key, value]) => {
          const placeholder = `{{${key}}}`;
          htmlBody = htmlBody.replace(new RegExp(placeholder, "g"), value);
          subject = subject.replace(new RegExp(placeholder, "g"), value);
        });
      }

      // Create campaign
      const campaign = new MarketingCampaign({
        name: options.name || template.name,
        type: "email",
        status: "draft",
        audienceId,
        content: {
          subject,
          htmlBody,
          body: template.htmlBody.replace(/<[^>]*>/g, ""), // Strip HTML for plain text
          callToAction: template.callToAction,
          callToActionUrl: options.callToActionUrl || "#",
        },
        integrations: {
          email: {
            status: "draft",
          },
        },
      });

      await campaign.save();

      return {
        success: true,
        campaignId: campaign._id,
        name: campaign.name,
        template: templateName,
        status: campaign.status,
        audienceId,
        createdAt: campaign.createdAt,
      };
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Create campaign error:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Schedule campaign for future execution
   * @param {String} campaignId - Campaign ID
   * @param {Date|String} scheduledFor - When to send (ISO string or Date)
   * @returns {Promise<Object>}
   */
  async scheduleCampaign(campaignId, scheduledFor) {
    try {
      const campaign = await MarketingCampaign.findById(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      // Validate scheduled date is in future
      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        throw new Error("Scheduled date must be in the future");
      }

      // Update campaign
      campaign.status = "scheduled";
      campaign.scheduledFor = scheduledDate;

      await campaign.save();

      return {
        success: true,
        campaignId: campaign._id,
        name: campaign.name,
        status: campaign.status,
        scheduledFor: campaign.scheduledFor,
        message: `Campaign scheduled for ${scheduledDate.toISOString()}`,
      };
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Schedule campaign error:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Execute scheduled campaigns that are due
   * Typically run by a background job/cron
   * @returns {Promise<Object>} Execution summary
   */
  async executeScheduledCampaigns() {
    try {
      const now = new Date();

      // Find campaigns scheduled for now or past
      const campaignsToExecute = await MarketingCampaign.find({
        status: "scheduled",
        scheduledFor: { $lte: now },
      });

      const results = {
        executedCount: 0,
        failedCount: 0,
        executions: [],
      };

      for (const campaign of campaignsToExecute) {
        try {
          // For bootcamp workflow, we would execute to audience members
          // This is a simplified version - in production would need recipient list
          campaign.status = "active";
          campaign.startedAt = new Date();
          await campaign.save();

          results.executedCount++;
          results.executions.push({
            campaignId: campaign._id,
            name: campaign.name,
            status: "executed",
          });
        } catch (error) {
          results.failedCount++;
          results.executions.push({
            campaignId: campaign._id,
            name: campaign.name,
            status: "failed",
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Execute scheduled error:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get campaign performance summary
   * @param {String} campaignId - Campaign ID
   * @returns {Promise<Object>}
   */
  async getCampaignPerformance(campaignId) {
    try {
      const campaign = await MarketingCampaign.findById(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const metrics = campaign.metrics || {};

      // Calculate performance rates
      const sent = metrics.sent || 0;
      const deliveryRate =
        sent > 0 ? (((metrics.delivered || 0) / sent) * 100).toFixed(2) : 0;
      const openRate =
        sent > 0 ? (((metrics.opened || 0) / sent) * 100).toFixed(2) : 0;
      const clickRate =
        sent > 0 ? (((metrics.clicked || 0) / sent) * 100).toFixed(2) : 0;
      const conversionRate =
        sent > 0 ? (((metrics.converted || 0) / sent) * 100).toFixed(2) : 0;

      return {
        success: true,
        campaign: {
          id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          createdAt: campaign.createdAt,
          startedAt: campaign.startedAt,
          scheduledFor: campaign.scheduledFor,
        },
        metrics: {
          sent,
          delivered: metrics.delivered || 0,
          opened: metrics.opened || 0,
          clicked: metrics.clicked || 0,
          engaged: metrics.engaged || 0,
          converted: metrics.converted || 0,
        },
        performance: {
          deliveryRate: `${deliveryRate}%`,
          openRate: `${openRate}%`,
          clickRate: `${clickRate}%`,
          conversionRate: `${conversionRate}%`,
          engagement: `${(((metrics.engaged || 0) / sent) * 100).toFixed(2)}%`,
        },
      };
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Get performance error:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get performance summary for multiple campaigns
   * @param {String} audienceId - Audience ID (optional filter)
   * @returns {Promise<Object>}
   */
  async getAudienceCampaignsSummary(audienceId) {
    try {
      let query = {};
      if (audienceId) {
        query.audienceId = audienceId;
      }

      const campaigns = await MarketingCampaign.find(query)
        .select("name status metrics createdAt startedAt")
        .lean();

      const summary = {
        totalCampaigns: campaigns.length,
        byStatus: {
          draft: 0,
          scheduled: 0,
          active: 0,
          completed: 0,
          paused: 0,
          archived: 0,
        },
        totalMetrics: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
        },
        campaigns: [],
      };

      for (const campaign of campaigns) {
        // Count by status
        if (summary.byStatus[campaign.status] !== undefined) {
          summary.byStatus[campaign.status]++;
        }

        // Aggregate metrics
        const metrics = campaign.metrics || {};
        summary.totalMetrics.sent += metrics.sent || 0;
        summary.totalMetrics.delivered += metrics.delivered || 0;
        summary.totalMetrics.opened += metrics.opened || 0;
        summary.totalMetrics.clicked += metrics.clicked || 0;
        summary.totalMetrics.converted += metrics.converted || 0;

        // Add campaign summary
        summary.campaigns.push({
          id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          sent: metrics.sent || 0,
          delivered: metrics.delivered || 0,
          opened: metrics.opened || 0,
          clicked: metrics.clicked || 0,
          converted: metrics.converted || 0,
        });
      }

      // Calculate overall rates
      const totalSent = summary.totalMetrics.sent;
      const overallMetrics = {
        deliveryRate:
          totalSent > 0
            ? `${((summary.totalMetrics.delivered / totalSent) * 100).toFixed(2)}%`
            : "0%",
        openRate:
          totalSent > 0
            ? `${((summary.totalMetrics.opened / totalSent) * 100).toFixed(2)}%`
            : "0%",
        clickRate:
          totalSent > 0
            ? `${((summary.totalMetrics.clicked / totalSent) * 100).toFixed(2)}%`
            : "0%",
        conversionRate:
          totalSent > 0
            ? `${((summary.totalMetrics.converted / totalSent) * 100).toFixed(2)}%`
            : "0%",
      };

      return {
        success: true,
        summary,
        overallMetrics,
      };
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Get summary error:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Create a complete bootcamp workflow
   * Combines: template → campaign → scheduling → execution
   * @param {String} audienceId - Audience ID
   * @param {Object} workflow - Workflow config {campaigns: [{template, name, scheduledFor, variables}]}
   * @returns {Promise<Object>}
   */
  async createBootcampWorkflow(audienceId, workflow) {
    try {
      // Verify audience exists
      const audience = await Audience.findById(audienceId);
      if (!audience) {
        throw new Error("Audience not found");
      }

      if (!workflow.campaigns || !Array.isArray(workflow.campaigns)) {
        throw new Error("workflow.campaigns array required");
      }

      const createdCampaigns = [];

      for (const campaignConfig of workflow.campaigns) {
        // Create campaign from template
        const campaign = await this.createBootcampCampaign(
          audienceId,
          campaignConfig.template,
          {
            name: campaignConfig.name,
            callToActionUrl: campaignConfig.callToActionUrl,
            variables: campaignConfig.variables,
          },
        );

        createdCampaigns.push(campaign);

        // Schedule if date provided
        if (campaignConfig.scheduledFor) {
          await this.scheduleCampaign(
            campaign.campaignId,
            campaignConfig.scheduledFor,
          );
        }
      }

      return {
        success: true,
        audienceId,
        workflowName: workflow.name || "Bootcamp Campaign Workflow",
        campaignsCreated: createdCampaigns.length,
        campaigns: createdCampaigns,
        message: `Created ${createdCampaigns.length} campaigns`,
      };
    } catch (error) {
      console.error(
        "[BootcampMarketingWorkflowService] Create workflow error:",
        error.message,
      );
      throw error;
    }
  }
}

module.exports = new BootcampMarketingWorkflowService();
