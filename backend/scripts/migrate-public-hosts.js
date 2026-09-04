require("dotenv").config();
const { connectDatabase } = require("../config/database");
const Workspace = require("../models/Workspace");

const hostGroups = [
  {
    label: "Lead Porch",
    slug: process.env.LEADPORCH_WORKSPACE_SLUG || "leadporch",
    hosts: String(
      process.env.LEADPORCH_HOSTS || "leadporch.co,www.leadporch.co",
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  },
  {
    label: "Ellie's Coaching",
    slug: process.env.ELLIE_WORKSPACE_SLUG || "ellie",
    hosts: String(
      process.env.ELLIE_PUBLIC_HOSTS ||
        "elliescoaching.com,www.elliescoaching.com",
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  },
];

async function migrate() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (hostGroups[0].slug === hostGroups[1].slug)
    throw new Error("Lead Porch and Ellie workspace slugs must be different");

  await connectDatabase(process.env.MONGO_URI);
  try {
    const workspaces = await Promise.all(
      hostGroups.map((group) => Workspace.findOne({ slug: group.slug })),
    );
    for (let index = 0; index < hostGroups.length; index += 1) {
      if (!workspaces[index])
        throw new Error(`${hostGroups[index].label} workspace was not found`);
    }

    const allHosts = hostGroups.flatMap((group) =>
      group.hosts.map((host) => ({ host, slug: group.slug })),
    );
    for (const { host, slug } of allHosts) {
      const owner = await Workspace.findOne({ publicHosts: host }).select(
        "slug",
      );
      if (owner && owner.slug !== slug)
        throw new Error(
          `${host} is already assigned to workspace ${owner.slug}`,
        );
    }

    for (let index = 0; index < hostGroups.length; index += 1) {
      const group = hostGroups[index];
      console.log(`${group.label} (${group.slug}): ${group.hosts.join(", ")}`);
      if (process.argv.includes("--apply"))
        await Workspace.updateOne(
          { _id: workspaces[index]._id },
          { $addToSet: { publicHosts: { $each: group.hosts } } },
        );
    }
    console.log(
      process.argv.includes("--apply")
        ? "Public host mappings applied."
        : "Dry run only. Re-run with --apply to save these mappings.",
    );
  } finally {
    await Workspace.db.close();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
