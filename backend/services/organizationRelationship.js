const OrganizationRelationship = require("../models/OrganizationRelationship");

/**
 * Create a relationship between an organization and audience.
 * Used when organizations are discovered/linked to an audience.
 *
 * @param {ObjectId} organizationId - Organization to relate
 * @param {ObjectId} audienceId - Audience context
 * @returns {Promise} Created or existing relationship
 */
async function createOrUpdateRelationship(organizationId, audienceId) {
  try {
    // Check if relationship already exists
    let relationship = await OrganizationRelationship.findOne({
      organizationId,
      audienceId,
    });

    if (relationship) {
      // Relationship already exists, return it
      return relationship;
    }

    // Create new relationship with "new" status
    relationship = await OrganizationRelationship.create({
      organizationId,
      audienceId,
      status: "new",
      notes: "",
      lastChangedAt: new Date(),
    });

    return relationship;
  } catch (error) {
    console.error(
      `Failed to create relationship for org ${organizationId} and audience ${audienceId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Bulk create relationships for multiple organizations in an audience.
 * Used during discovery run to establish initial relationships.
 *
 * @param {Array<ObjectId>} organizationIds - Organizations to relate
 * @param {ObjectId} audienceId - Audience context
 * @returns {Promise<Object>} Stats on created/existing relationships
 */
async function bulkCreateRelationships(organizationIds, audienceId) {
  try {
    const created = [];
    const existing = [];

    for (const organizationId of organizationIds) {
      const rel = await createOrUpdateRelationship(organizationId, audienceId);
      if (rel.createdAt === rel.updatedAt) {
        created.push(rel._id);
      } else {
        existing.push(rel._id);
      }
    }

    return {
      created: created.length,
      existing: existing.length,
      total: created.length + existing.length,
    };
  } catch (error) {
    console.error("Failed to bulk create relationships:", error);
    throw error;
  }
}

/**
 * Get relationship status for organization in audience.
 *
 * @param {ObjectId} organizationId
 * @param {ObjectId} audienceId
 * @returns {Promise<Object|null>} Relationship or null if not found
 */
async function getRelationship(organizationId, audienceId) {
  try {
    return await OrganizationRelationship.findOne({
      organizationId,
      audienceId,
    }).lean();
  } catch (error) {
    console.error("Failed to get relationship:", error);
    throw error;
  }
}

/**
 * Update relationship status.
 *
 * @param {ObjectId} organizationId
 * @param {ObjectId} audienceId
 * @param {String} status - One of: new, reviewing, qualified, partner, customer, rejected
 * @param {String} notes - Optional notes
 * @returns {Promise<Object>} Updated relationship
 */
async function updateStatus(organizationId, audienceId, status, notes = "") {
  try {
    const relationship = await OrganizationRelationship.findOneAndUpdate(
      { organizationId, audienceId },
      {
        status,
        notes,
        lastChangedAt: new Date(),
      },
      { new: true },
    );

    return relationship;
  } catch (error) {
    console.error("Failed to update relationship status:", error);
    throw error;
  }
}

/**
 * Get all organizations for an audience, optionally filtered by status.
 *
 * @param {ObjectId} audienceId
 * @param {String} status - Optional status filter
 * @param {Number} limit
 * @param {Number} skip
 * @returns {Promise<Object>} Organizations with relationships
 */
async function getOrganizationsByStatus(
  audienceId,
  status = null,
  limit = 25,
  skip = 0,
) {
  try {
    const filter = { audienceId };
    if (status) {
      filter.status = status;
    }

    const [relationships, total] = await Promise.all([
      OrganizationRelationship.find(filter)
        .sort({ lastChangedAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      OrganizationRelationship.countDocuments(filter),
    ]);

    return {
      relationships,
      total,
    };
  } catch (error) {
    console.error("Failed to get organizations by status:", error);
    throw error;
  }
}

/**
 * Get status distribution for all organizations in an audience.
 *
 * @param {ObjectId} audienceId
 * @returns {Promise<Object>} Count by status
 */
async function getStatusDistribution(audienceId) {
  try {
    const statuses = [
      "new",
      "reviewing",
      "qualified",
      "partner",
      "customer",
      "rejected",
    ];
    const distribution = {};

    for (const status of statuses) {
      const count = await OrganizationRelationship.countDocuments({
        audienceId,
        status,
      });
      distribution[status] = count;
    }

    return distribution;
  } catch (error) {
    console.error("Failed to get status distribution:", error);
    throw error;
  }
}

module.exports = {
  createOrUpdateRelationship,
  bulkCreateRelationships,
  getRelationship,
  updateStatus,
  getOrganizationsByStatus,
  getStatusDistribution,
};
