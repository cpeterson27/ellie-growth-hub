const mongoose = require("mongoose");
const Organization = require("./models/Organization");
const Audience = require("./models/Audience");
const { connectDatabase } = require("./config/database");

async function setupTestData() {
  try {
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/ellie";
    await connectDatabase(mongoUri);
    console.log("✓ Connected to MongoDB\n");

    // Create test Audience
    console.log("Creating test Audience...\n");
    const audience = await Audience.create({
      name: "Real Estate Multifamily Investors",
      description:
        "Companies investing in multifamily real estate with 5-500 employees",
      status: "active",
      source: "manual",
      criteria: {
        keywords: ["multifamily", "apartment", "syndication", "investment"],
        industries: ["real estate", "real estate investment trust"],
        locations: ["United States"],
        employeeRange: { min: 5, max: 500 },
        minimumScore: 50,
        targetTier: "medium",
      },
    });
    console.log(`✓ Created Audience: ${audience.name}\n`);

    // Create test Organizations
    console.log("Creating test Organizations...\n");
    const testOrgs = [
      {
        name: "Multifamily Leadership LLC",
        domain: "multifamilyleadership.com",
        industry: "Real Estate Investment Trust",
        audienceScore: 95,
        audienceTier: "high",
        employeeCount: 250,
        location: "San Francisco, California",
        website: "https://multifamilyleadership.com",
        linkedinUrl: "https://linkedin.com/company/multifamily-leadership",
        description:
          "Leading multifamily investment firm focused on sustainable real estate syndication across western United States",
        phone: "+1-415-555-0100",
        keywords: ["multifamily", "apartment", "syndication", "investment"],
        discoveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        enrichedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        name: "TruAmerica Investors",
        domain: "truamerica.com",
        industry: "Real Estate",
        audienceScore: 75,
        audienceTier: "high",
        employeeCount: 180,
        location: "Los Angeles, California",
        website: "https://truamerica.com",
        linkedinUrl: "https://linkedin.com/company/truamerica",
        description: "Real estate investment company specializing in apartments",
        phone: "+1-310-555-0200",
        keywords: ["real estate", "apartment"],
        discoveredAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        enrichedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      },
      {
        name: "Venture Capital Real Estate",
        domain: "vcrealestate.com",
        industry: "Venture Capital",
        audienceScore: 35,
        audienceTier: "low",
        employeeCount: 75,
        location: "New York, New York",
        website: "https://vcrealestate.com",
        linkedinUrl: "",
        description: "",
        phone: "",
        keywords: [],
        discoveredAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        enrichedAt: null,
      },
      {
        name: "Property Management Solutions Inc",
        domain: "propmgtsolutions.com",
        industry: "Real Estate Management",
        audienceScore: 55,
        audienceTier: "medium",
        employeeCount: 320,
        location: "Chicago, Illinois",
        website: "https://propmgtsolutions.com",
        linkedinUrl: "https://linkedin.com/company/prop-mgmt-solutions",
        description: "Property management with focus on multifamily assets",
        phone: "+1-312-555-0300",
        keywords: ["property", "multifamily", "management"],
        discoveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        enrichedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        name: "Commercial Development Corp",
        domain: "commdevco.com",
        industry: "Commercial Real Estate",
        audienceScore: 40,
        audienceTier: "low",
        employeeCount: 600,
        location: "Dallas, Texas",
        website: "https://commdevco.com",
        linkedinUrl: "",
        description: "Commercial real estate development, office and retail focus",
        phone: "",
        keywords: [],
        discoveredAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        enrichedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const orgData of testOrgs) {
      const org = await Organization.create(orgData);
      console.log(`✓ Created: ${org.name} (score: ${org.audienceScore})`);
    }

    console.log("\n✅ Test data setup complete!\n");
    process.exit(0);
  } catch (error) {
    console.error("Setup error:", error);
    process.exit(1);
  }
}

setupTestData();
