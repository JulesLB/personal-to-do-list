// Force the local SQLite DB before anything imports the Prisma client. .env
// (loaded via --env-file) supplies ANTHROPIC_API_KEY but its cloud DATABASE_URL
// is overridden here so this never reads prod. Logic lives in main() so the
// dynamic imports don't need top-level await (this runs as CJS under tsx).
process.env.DATABASE_URL = "file:./dev.db";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { interpret } = await import("../src/lib/classify");
  const { nowLabelHKT } = await import("../src/lib/rank");

  const msg = process.argv.slice(2).join(" ").trim();
  if (!msg) {
    console.error('Usage: npm run try -- "your message here"');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const now = nowLabelHKT(new Date());
  const open = await prisma.item.findMany({ where: { status: "open" }, orderBy: { id: "asc" } });
  const lite = open.map((i) => ({
    id: i.id,
    title: i.title,
    type: i.type,
    category: i.category,
    referee: i.referee,
    deadline: i.deadline ? i.deadline.toISOString().slice(0, 10) : null,
  }));

  console.log("\nOpen items the router can see:");
  for (const i of lite) console.log(`  #${i.id} ${i.title} [${i.type}]`);
  console.log(`\nYou said: "${msg}"\n`);

  const intent = await interpret(msg, now, lite);
  console.log("Router decided:");
  console.log(JSON.stringify(intent, null, 2));
  console.log(`\nReply it would send: ${intent.reply}`);

  await prisma.$disconnect();
}

main();
